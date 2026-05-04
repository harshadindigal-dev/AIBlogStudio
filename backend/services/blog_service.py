"""
Blog generation services: text (OpenAI / Claude / Gemini), image (OpenAI + Gemini), and automated planner.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

from dotenv import load_dotenv
from openai import AsyncOpenAI

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BACKEND_ROOT / ".env")

BLOG_ASSETS_DIR = BACKEND_ROOT / "blog_assets"
BLOG_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

BLOG_PROJECTS_DIR = BACKEND_ROOT / "blog_projects"
BLOG_PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# Default model for each text provider
PROVIDER_DEFAULT_MODELS: Dict[str, str] = {
    "openai": "gpt-4o-mini",
    "claude": "claude-sonnet-4-6",
    "gemini": "gemini-2.0-flash",
}

# ---------------------------------------------------------------------------
# Client factories
# ---------------------------------------------------------------------------

def _openai_client() -> AsyncOpenAI:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is required. Add it to your .env file.")
    import httpx
    return AsyncOpenAI(api_key=key, timeout=httpx.Timeout(1800.0, connect=10.0))


def _claude_client():
    """Return an AsyncAnthropic client (lazy import so dep is optional)."""
    import anthropic
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is required for Claude. Add it to your .env file.")
    return anthropic.AsyncAnthropic(api_key=key)


def _gemini_client():
    """Return a google-genai Client (lazy import so dep is optional). Used for text and images."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is required for Gemini. Add it to .env.")
    from google import genai
    return genai.Client(api_key=key)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> Any:
    """Parse JSON from model output, with a regex fallback for wrapped responses."""
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not extract JSON from response: {text[:300]}")


def _to_gemini_contents(messages: List[Dict[str, str]]) -> List[Dict]:
    """Convert OpenAI-format messages to Gemini contents list (role: user | model)."""
    result = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        result.append({"role": role, "parts": [{"text": msg["content"]}]})
    return result


# ---------------------------------------------------------------------------
# Shared image-prompt instruction
# ---------------------------------------------------------------------------
_IMAGE_PROMPT_INSTR = (
    "Choose the visual type that BEST illustrates this section from: "
    "INFOGRAPHIC (step-by-step layout or process chart), "
    "GEOGRAPHIC MAP (stylized regional map with highlighted areas), "
    "COMPARISON TABLE (side-by-side grid), "
    "ISOMETRIC 3D SCENE (environment in isometric perspective), "
    "FLAT VECTOR ILLUSTRATION (stylized characters or workflow scene), "
    "EDITORIAL PHOTO (realistic scene with people and environment). "
    "Write a complete, ready-to-use AI image generation prompt (80-120 words). "
    "STRICT RULES — violating any of these causes image failure: "
    "(1) NO logos, brand marks, university crests, seals, emblems, or abbreviation chips/badges of any kind — "
    "university or company names mentioned only as context must NOT appear as visual elements; "
    "only include a name as a text label if it is explicitly positioned in this prompt as a data point; "
    "(2) NO placeholder values — never write $X, $XX, $XXX, $YY, N/A, TBD — use realistic specific numbers (e.g. '$450', '4.8/5'); "
    "(3) For every visual containing text, spell out EVERY word and number explicitly: "
    "COMPARISON TABLE — list every column header and every row as 'Row N: val1 | val2 | val3'; "
    "INFOGRAPHIC — list every section title and label verbatim; "
    "GEOGRAPHIC MAP — for each labeled point state: exact label text, and its position as compass "
    "direction + distance from the map center (e.g. 'Howard University: label northeast of DC center, ~2 miles'). "
    "Each label must appear EXACTLY ONCE — never duplicate a label. "
    "For the DMV region the correct geography is: GW=Foggy Bottom DC center, Georgetown=northwest DC along Potomac, "
    "American University=further northwest DC, Howard=northeast DC, "
    "UMD=College Park MD northeast of DC (~10 miles), GMU=Fairfax VA southwest of DC (~20 miles), "
    "Marymount=Arlington VA just west across Potomac. "
    "Any text not fully defined here will be hallucinated. "
    "Also specify: named color palette, art style, composition. "
    "No watermarks. No photo-realistic human faces."
)


# ---------------------------------------------------------------------------
# BlogTextService — provider-agnostic text generation
# ---------------------------------------------------------------------------

class BlogTextService:
    """Text generation routing to OpenAI, Claude, or Gemini."""

    def __init__(self, provider: str = "openai", model: str | None = None):
        if provider not in PROVIDER_DEFAULT_MODELS:
            raise ValueError(f"provider must be one of {list(PROVIDER_DEFAULT_MODELS)}")
        self.provider = provider
        self.model = model or PROVIDER_DEFAULT_MODELS[provider]

    # -- Internal: provider-specific async streaming generators ---------------

    async def _openai_stream(
        self, messages: List[Dict[str, str]], system: str | None
    ) -> AsyncGenerator[str, None]:
        sys_msgs = [{"role": "system", "content": system}] if system else []
        client = _openai_client()
        stream = await client.chat.completions.create(
            model=self.model,
            messages=sys_msgs + messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    async def _claude_stream(
        self, messages: List[Dict[str, str]], system: str | None
    ) -> AsyncGenerator[str, None]:
        client = _claude_client()
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system
        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def _gemini_stream(
        self, messages: List[Dict[str, str]], system: str | None
    ) -> AsyncGenerator[str, None]:
        from google import genai as gai
        from google.genai import types
        client = _gemini_client()
        contents = _to_gemini_contents(messages)

        config_kwargs: Dict[str, Any] = {}
        if system:
            config_kwargs["system_instruction"] = system
        config = types.GenerateContentConfig(**config_kwargs)

        async for chunk in client.aio.models.generate_content_stream(
            model=self.model,
            contents=contents,
            config=config,
        ):
            if chunk.text:
                yield chunk.text

    # -- Internal: single-turn JSON completion (all providers) ---------------

    async def _complete_json(self, prompt: str, max_tokens: int = 4096) -> Any:
        """Single-turn completion returning parsed JSON, routed to the active provider."""
        if self.provider == "openai":
            client = _openai_client()
            resp = await client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)

        elif self.provider == "claude":
            client = _claude_client()
            resp = await client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return _extract_json(resp.content[0].text)

        elif self.provider == "gemini":
            from google import genai as gai
            from google.genai import types
            client = _gemini_client()
            resp = await client.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            return json.loads(resp.text)

    # -- Public: streaming chat (brainstorm / Q&A) ---------------------------

    async def chat_stream(
        self, messages: List[Dict[str, str]], system: str | None = None
    ) -> AsyncGenerator[str, None]:
        if self.provider == "openai":
            async for token in self._openai_stream(messages, system):
                yield token
        elif self.provider == "claude":
            async for token in self._claude_stream(messages, system):
                yield token
        elif self.provider == "gemini":
            async for token in self._gemini_stream(messages, system):
                yield token

    # -- Public: outline generation -----------------------------------------

    async def generate_outline(
        self, topic: str, audience: str = "", tone: str = "professional", num_sections: int = 5
    ) -> Dict[str, Any]:
        prompt = f"""You are a professional blog content strategist.

Create a detailed blog post outline for the following:
- Topic: {topic}
- Target audience: {audience or 'general'}
- Tone: {tone}
- Number of sections: {num_sections}

Return ONLY valid JSON with this structure:
{{
  "title": "Blog post title",
  "subtitle": "Optional subtitle",
  "sections": [
    {{
      "heading": "Section heading",
      "bullet_points": ["key point 1", "key point 2"],
      "image_suggestion": "{_IMAGE_PROMPT_INSTR}"
    }}
  ],
  "meta_description": "SEO meta description (under 160 chars)"
}}"""
        return await self._complete_json(prompt)

    # -- Public: outline refinement -----------------------------------------

    async def refine_outline(
        self, outline: Dict[str, Any], feedback: str
    ) -> Dict[str, Any]:
        prompt = f"""You are a professional blog content strategist.

Here is an existing blog post outline:
{json.dumps(outline, indent=2)}

The user wants the following changes:
{feedback}

Return the COMPLETE revised outline as valid JSON with the same structure:
{{
  "title": "Blog post title",
  "subtitle": "Optional subtitle",
  "sections": [
    {{
      "heading": "Section heading",
      "bullet_points": ["key point 1", "key point 2"],
      "image_suggestion": "{_IMAGE_PROMPT_INSTR}"
    }}
  ],
  "meta_description": "SEO meta description (under 160 chars)"
}}"""
        return await self._complete_json(prompt)

    # -- Public: initial structured questions --------------------------------

    async def generate_initial_questions(self, blog_idea: str) -> Dict[str, Any]:
        """Return 5 follow-up questions (each with 3 suggestions) for a blog idea."""
        prompt = f"""A user wants to write a blog post about: "{blog_idea}"

Generate exactly 5 specific, targeted follow-up questions that will help craft an excellent,
tailored blog post. For each question provide exactly 3 short, concrete suggested answers
(3-10 words each).

Return ONLY valid JSON:
{{
  "intro": "A 1-2 sentence acknowledgment of their idea and that you have a few quick questions",
  "questions": [
    {{"id": "q1", "question": "Who is the primary audience for this post?",
      "suggestions": ["Software developers", "Engineering managers", "General tech readers"]}},
    {{"id": "q2", "question": "...", "suggestions": ["...", "...", "..."]}},
    {{"id": "q3", "question": "...", "suggestions": ["...", "...", "..."]}},
    {{"id": "q4", "question": "...", "suggestions": ["...", "...", "..."]}},
    {{"id": "q5", "question": "...", "suggestions": ["...", "...", "..."]}}
  ]
}}"""
        return await self._complete_json(prompt)

    # -- Public: suggestion generation --------------------------------------

    async def generate_suggestions(
        self, messages: List[Dict[str, str]], system: str | None = None
    ) -> List[str]:
        """Generate 3 short suggested answers to the latest assistant question."""
        last_assistant = next(
            (m["content"] for m in reversed(messages) if m["role"] == "assistant"), ""
        )
        first_user = next(
            (m["content"] for m in messages if m["role"] == "user"), ""
        )
        if not last_assistant or not first_user:
            return []

        prompt = f"""A user is brainstorming a blog post with this initial idea:
"{first_user}"

The assistant just asked this follow-up question:
"{last_assistant}"

Generate exactly 3 concise, specific suggested answers (1–2 sentences each) that would be
natural and helpful responses to the question, in the context of the blog topic.

Return ONLY valid JSON: {{"suggestions": ["answer 1", "answer 2", "answer 3"]}}"""

        data = await self._complete_json(prompt)
        return data.get("suggestions", [])

    # -- Public: section drafting (streaming) --------------------------------

    async def draft_section_stream(
        self,
        heading: str,
        bullet_points: List[str] | None = None,
        context: str = "",
        tone: str = "professional",
        word_count: int = 300,
    ) -> AsyncGenerator[str, None]:
        bullets = "\n".join(f"- {b}" for b in (bullet_points or []))
        prompt = f"""Write the body content for this blog section.

Section: {heading}
Key points:
{bullets}
Context: {context}
Tone: {tone}
Length: ~{word_count} words

STRICT RULES:
- Output ONLY body paragraphs. Do NOT write any heading, subheading, or title — not at the start, not at the end, not anywhere.
- Do NOT repeat or reference "{heading}" as a line of text.
- Start immediately with the first paragraph of content.
- Use **bold** for key terms and important phrases.
- Use bullet lists (- item) when listing 3 or more items.
- Write clear, engaging prose with short paragraphs (3-5 sentences each).
- End with a forward-looking or action sentence, not a heading."""

        async for token in self.chat_stream([{"role": "user", "content": prompt}]):
            yield token


# ---------------------------------------------------------------------------
# BlogImageService
# ---------------------------------------------------------------------------

class BlogImageService:
    """Unified image generation over OpenAI (GPT-5 tool use) and Gemini (Imagen 4)."""

    SUPPORTED_PROVIDERS = ("openai", "gemini")

    async def generate(
        self,
        prompt: str,
        provider: str = "openai",
        style: str = "",
        size: str = "1024x1024",
        quality: str = "medium",
        blog_id: str | None = None,
    ) -> Dict[str, Any]:
        if provider not in self.SUPPORTED_PROVIDERS:
            raise ValueError(f"Image provider must be one of {self.SUPPORTED_PROVIDERS}")

        enriched = self._enrich_prompt(prompt, style)
        log.info("[IMG] START provider=%s size=%s quality=%s blog_id=%s", provider, size, quality, blog_id)
        log.info("[IMG] PROMPT: %s", enriched[:200])
        t0 = time.time()

        try:
            if provider == "openai":
                result = await self._generate_openai(enriched, size, quality, blog_id)
            else:
                result = await self._generate_gemini(enriched, blog_id)
            log.info("[IMG] DONE in %.1fs image_id=%s", time.time() - t0, result.get("image_id"))
            return result
        except Exception as exc:
            log.error("[IMG] FAILED after %.1fs error=%s", time.time() - t0, exc)
            raise

    # -- OpenAI (GPT-5 Responses API) ---------------------------------------

    async def _generate_openai(
        self, prompt: str, size: str, quality: str, blog_id: str | None
    ) -> Dict[str, Any]:
        client = _openai_client()
        response = await client.responses.create(
            model="gpt-5",
            input=prompt,
            tools=[{"type": "image_generation", "size": size, "quality": quality}],
        )
        image_data = [
            output.result
            for output in response.output
            if output.type == "image_generation_call"
        ]
        if not image_data:
            raise RuntimeError("GPT-5 returned no image output.")
        b64 = image_data[0]
        image_id = uuid.uuid4().hex[:12]
        path = self._save_image(b64, image_id, blog_id)
        return {
            "image_id": image_id,
            "provider": "openai",
            "prompt": prompt,
            "b64": b64,
            "path": str(path) if path else None,
            "size": size,
            "quality": quality,
        }

    # -- Gemini / Imagen ----------------------------------------------------

    async def _generate_gemini(
        self, prompt: str, blog_id: str | None
    ) -> Dict[str, Any]:
        client = _gemini_client()
        from google.genai import types

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.models.generate_images(
                model="imagen-4.0-generate-001",
                prompt=prompt,
                config=types.GenerateImagesConfig(number_of_images=1),
            ),
        )
        if not response.generated_images:
            raise RuntimeError("Gemini returned no images.")

        img_bytes = response.generated_images[0].image.image_bytes
        b64 = base64.b64encode(img_bytes).decode("ascii")
        image_id = uuid.uuid4().hex[:12]
        path = self._save_image(b64, image_id, blog_id)
        return {
            "image_id": image_id,
            "provider": "gemini",
            "prompt": prompt,
            "b64": b64,
            "path": str(path) if path else None,
        }

    # -- helpers ------------------------------------------------------------

    @staticmethod
    def _enrich_prompt(prompt: str, style: str) -> str:
        base = f"{prompt}. Style: {style}" if style else prompt
        return (
            f"{base}. "
            "CRITICAL: every word, number, label, header, and cell value that should appear "
            "in the image is explicitly stated above — render only the text defined, nothing else. "
            "Professional editorial quality, full bleed composition, nothing cropped at the edges."
        )

    @staticmethod
    def _save_image(b64: str, image_id: str, blog_id: str | None) -> Path | None:
        if not blog_id:
            return None
        folder = BLOG_ASSETS_DIR / blog_id
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{image_id}.png"
        path.write_bytes(base64.b64decode(b64))
        return path


# ---------------------------------------------------------------------------
# BlogPlannerService  (Autopilot mode)
# ---------------------------------------------------------------------------

class BlogPlannerService:
    """Generates content calendars and bulk-produces blog posts."""

    def __init__(self, text_provider: str = "openai"):
        self.text = BlogTextService(provider=text_provider)
        self.image = BlogImageService()

    async def generate_plan(
        self,
        company_name: str,
        company_description: str,
        topics: List[str],
        audience: str,
        posts_per_week: int = 2,
        weeks: int = 4,
    ) -> Dict[str, Any]:
        topics_str = ", ".join(topics)
        prompt = f"""You are a content marketing strategist.

Create a {weeks}-week blog content calendar for:
- Company: {company_name}
- Description: {company_description}
- Topic areas: {topics_str}
- Target audience: {audience}
- Posts per week: {posts_per_week}

Return ONLY valid JSON:
{{
  "company_name": "{company_name}",
  "weeks": {weeks},
  "posts_per_week": {posts_per_week},
  "entries": [
    {{
      "week": 1,
      "day_of_week": "Monday",
      "title": "Blog post title",
      "topic_area": "which topic this falls under",
      "outline_summary": "2-3 sentence summary of what the post covers",
      "image_concept": "{_IMAGE_PROMPT_INSTR}"
    }}
  ]
}}

Generate exactly {weeks * posts_per_week} entries spread evenly across the weeks."""

        plan = await self.text._complete_json(prompt, max_tokens=8192)
        for entry in plan.get("entries", []):
            entry.setdefault("status", "planned")
            entry.setdefault("blog_project_id", None)
        return plan

    async def generate_post(
        self,
        entry: Dict[str, Any],
        company_name: str,
        audience: str,
        image_provider: str = "openai",
    ) -> Dict[str, Any]:
        """Generate a complete blog post (text + images) for one calendar entry."""
        # 1. Generate outline
        outline = await self.text.generate_outline(
            topic=entry["title"],
            audience=audience,
            tone="professional",
            num_sections=5,
        )

        # 2. Generate section text
        sections = []
        for i, section in enumerate(outline.get("sections", [])):
            content_parts: list[str] = []
            async for chunk in self.text.draft_section_stream(
                heading=section["heading"],
                bullet_points=section.get("bullet_points", []),
                context=f"This is for {company_name}. Post title: {entry['title']}",
                tone="professional",
                word_count=250,
            ):
                content_parts.append(chunk)
            sections.append({
                "id": uuid.uuid4().hex[:8],
                "heading": section["heading"],
                "content": "".join(content_parts),
                "image_ids": [],
                "order": i,
            })

        # 3. Generate hero image
        blog_id = uuid.uuid4().hex
        image_concept = entry.get("image_concept", entry["title"])
        try:
            hero = await self.image.generate(
                prompt=image_concept,
                provider=image_provider,
                blog_id=blog_id,
            )
            hero_image = {
                "id": hero["image_id"],
                "prompt": hero["prompt"],
                "provider": hero["provider"],
                "b64": hero["b64"],
                "url": f"/blog-assets/{blog_id}/{hero['image_id']}.png",
                "alt": image_concept,
            }
        except Exception as e:
            hero_image = None
            print(f"[WARN] Hero image generation failed: {e}")

        # 4. Assemble project
        from datetime import datetime
        project = {
            "id": blog_id,
            "title": outline.get("title", entry["title"]),
            "subtitle": outline.get("subtitle", ""),
            "mode": "autopilot",
            "sections": sections,
            "images": [hero_image] if hero_image else [],
            "meta_description": outline.get("meta_description", ""),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

        # 5. Persist
        (BLOG_PROJECTS_DIR / f"{blog_id}.json").write_text(json.dumps(project, indent=2))

        return project

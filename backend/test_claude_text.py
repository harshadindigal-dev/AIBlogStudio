"""
Test Claude text generation (Anthropic SDK) for blog content tasks.

Run from the backend/ directory:
    python test_claude_text.py

Requires ANTHROPIC_API_KEY in ../.env or backend/.env
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env")

MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _client() -> anthropic.AsyncAnthropic:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        print("ERROR: ANTHROPIC_API_KEY not set. Add it to your .env file.")
        sys.exit(1)
    return anthropic.AsyncAnthropic(api_key=key)


def _section(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


# ---------------------------------------------------------------------------
# Test 1: Streaming chat
# ---------------------------------------------------------------------------

async def test_streaming_chat() -> None:
    _section("Test 1: Streaming chat (brainstorm)")
    client = _client()

    messages = [
        {"role": "user", "content": "I want to write a blog post about how AI is changing software development."}
    ]
    system = "You are a professional blog content strategist helping brainstorm ideas."

    print("Prompt: I want to write a blog post about how AI is changing software development.\n")
    print("Response (streaming):")

    token_count = 0
    async with client.messages.stream(
        model=MODEL,
        max_tokens=400,
        system=system,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            print(text, end="", flush=True)
            token_count += 1

    print(f"\n\n[streamed {token_count} tokens]")


# ---------------------------------------------------------------------------
# Test 2: JSON outline generation
# ---------------------------------------------------------------------------

async def test_outline_generation() -> None:
    _section("Test 2: JSON outline generation")
    client = _client()

    prompt = """You are a professional blog content strategist.

Create a detailed blog post outline for the following:
- Topic: How AI coding assistants are changing software development
- Target audience: software engineers
- Tone: professional
- Number of sections: 3

Return ONLY valid JSON with this structure:
{
  "title": "Blog post title",
  "subtitle": "Optional subtitle",
  "sections": [
    {
      "heading": "Section heading",
      "bullet_points": ["key point 1", "key point 2"]
    }
  ],
  "meta_description": "SEO meta description (under 160 chars)"
}"""

    resp = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = resp.content[0].text
    try:
        outline = json.loads(raw.strip())
        print(json.dumps(outline, indent=2))
    except json.JSONDecodeError:
        print("Raw response (JSON parse failed):")
        print(raw)

    usage = resp.usage
    print(f"\n[input: {usage.input_tokens} tokens | output: {usage.output_tokens} tokens]")


# ---------------------------------------------------------------------------
# Test 3: Initial questions (JSON structured)
# ---------------------------------------------------------------------------

async def test_initial_questions() -> None:
    _section("Test 3: Initial blog brainstorm questions")
    client = _client()

    blog_idea = "AI-powered DevOps: automating deployments and incident response"

    prompt = f"""A user wants to write a blog post about: "{blog_idea}"

Generate exactly 5 specific follow-up questions to refine the blog post. For each question
provide exactly 3 short suggested answers (3-10 words each).

Return ONLY valid JSON:
{{
  "intro": "1-2 sentence acknowledgment",
  "questions": [
    {{"id": "q1", "question": "...", "suggestions": ["...", "...", "..."]}},
    {{"id": "q2", "question": "...", "suggestions": ["...", "...", "..."]}},
    {{"id": "q3", "question": "...", "suggestions": ["...", "...", "..."]}},
    {{"id": "q4", "question": "...", "suggestions": ["...", "...", "..."]}},
    {{"id": "q5", "question": "...", "suggestions": ["...", "...", "..."]}}
  ]
}}"""

    resp = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = resp.content[0].text
    try:
        data = json.loads(raw.strip())
        print(f"Intro: {data['intro']}\n")
        for q in data.get("questions", []):
            print(f"Q{q['id']}: {q['question']}")
            for s in q.get("suggestions", []):
                print(f"   • {s}")
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Parse error ({e}). Raw response:")
        print(raw)


# ---------------------------------------------------------------------------
# Test 4: Section draft (streaming)
# ---------------------------------------------------------------------------

async def test_section_draft() -> None:
    _section("Test 4: Blog section draft (streaming)")
    client = _client()

    prompt = """Write a blog section with the following details:
Heading: How AI Pair Programming Changes the Development Flow
Key points:
- Real-time code suggestions reduce context switching
- AI catches common bugs before code review
- Developers spend more time on architecture and design
Tone: professional
Target length: ~200 words

Write in markdown. Do NOT include the heading itself.
Make the writing engaging, clear, and well-structured."""

    print("Drafting section (streaming):\n")
    async with client.messages.stream(
        model=MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for text in stream.text_stream:
            print(text, end="", flush=True)
    print("\n")


# ---------------------------------------------------------------------------
# Test 5: Using BlogTextService directly
# ---------------------------------------------------------------------------

async def test_via_service() -> None:
    _section("Test 5: BlogTextService with provider='claude'")
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from services.blog_service import BlogTextService

    svc = BlogTextService(provider="claude")
    print(f"Provider: {svc.provider}  |  Model: {svc.model}\n")

    # Test suggestions
    messages = [
        {"role": "user", "content": "I want to write about AI in healthcare."},
        {"role": "assistant", "content": "Great topic! What specific aspect of AI in healthcare interests you most — diagnostics, drug discovery, or patient care?"},
    ]
    suggestions = await svc.generate_suggestions(messages)
    print("Suggestions for latest assistant question:")
    for i, s in enumerate(suggestions, 1):
        print(f"  {i}. {s}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    print(f"Testing Claude text generation — model: {MODEL}")
    print(f"SDK version: {anthropic.__version__}")

    await test_streaming_chat()
    await test_outline_generation()
    await test_initial_questions()
    await test_section_draft()
    await test_via_service()

    print("\n" + "="*60)
    print("  All Claude tests completed.")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())

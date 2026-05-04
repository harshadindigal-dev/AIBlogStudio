"""
Test Gemini text generation (google-genai SDK) for blog content tasks.

Run from the backend/ directory:
    python test_gemini_text.py

Requires GEMINI_API_KEY in ../.env or backend/.env
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env")

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _client() -> genai.Client:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        print("ERROR: GEMINI_API_KEY not set. Add it to your .env file.")
        sys.exit(1)
    return genai.Client(api_key=key)


def _section(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


# ---------------------------------------------------------------------------
# Test 1: Sync chat with history (as shown in user example)
# ---------------------------------------------------------------------------

def test_sync_chat_with_history() -> None:
    _section("Test 1: Sync chat with history (google-genai style)")
    client = _client()

    chat = client.chats.create(model=MODEL)

    r1 = chat.send_message("I want to write a blog post about how AI is changing software development.")
    print(f"Turn 1:\n{r1.text}\n")

    r2 = chat.send_message("Focus on AI pair programming and code review automation.")
    print(f"Turn 2:\n{r2.text}\n")

    print("Chat history:")
    for msg in chat.get_history():
        preview = msg.parts[0].text[:120].replace('\n', ' ')
        print(f"  [{msg.role}] {preview}...")


# ---------------------------------------------------------------------------
# Test 2: Async streaming generation
# ---------------------------------------------------------------------------

async def test_async_streaming() -> None:
    _section("Test 2: Async streaming generation")
    client = _client()

    prompt = "Write a compelling 3-paragraph blog intro about AI pair programming tools like GitHub Copilot."
    print(f"Prompt: {prompt}\n")
    print("Response (async streaming):")

    token_count = 0
    async for chunk in client.aio.models.generate_content_stream(
        model=MODEL,
        contents=prompt,
    ):
        if chunk.text:
            print(chunk.text, end="", flush=True)
            token_count += 1

    print(f"\n\n[{token_count} chunks streamed]")


# ---------------------------------------------------------------------------
# Test 3: JSON structured output (response_mime_type)
# ---------------------------------------------------------------------------

async def test_json_outline() -> None:
    _section("Test 3: JSON outline generation (response_mime_type)")
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

    resp = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    outline = json.loads(resp.text)
    print(json.dumps(outline, indent=2))


# ---------------------------------------------------------------------------
# Test 4: Multi-turn async (contents list format)
# ---------------------------------------------------------------------------

async def test_async_multiturn() -> None:
    _section("Test 4: Async multi-turn via contents list")
    client = _client()

    contents = [
        {"role": "user", "parts": [{"text": "I want to write a blog about AI in healthcare."}]},
        {"role": "model", "parts": [{"text": "Great topic! Are you focusing on diagnostics, patient care, or drug discovery?"}]},
        {"role": "user", "parts": [{"text": "Diagnostics and medical imaging specifically."}]},
    ]

    resp = await client.aio.models.generate_content(
        model=MODEL,
        contents=contents,
    )
    print(f"Response:\n{resp.text}")


# ---------------------------------------------------------------------------
# Test 5: System instruction
# ---------------------------------------------------------------------------

async def test_system_instruction() -> None:
    _section("Test 5: System instruction support")
    client = _client()

    resp = await client.aio.models.generate_content(
        model=MODEL,
        contents="Give me 3 blog post title ideas about machine learning.",
        config=types.GenerateContentConfig(
            system_instruction="You are a creative tech blog editor. Always respond with numbered lists. Keep titles punchy and under 10 words.",
        ),
    )
    print(resp.text)


# ---------------------------------------------------------------------------
# Test 6: Using BlogTextService directly
# ---------------------------------------------------------------------------

async def test_via_service() -> None:
    _section("Test 6: BlogTextService with provider='gemini'")
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from services.blog_service import BlogTextService

    svc = BlogTextService(provider="gemini")
    print(f"Provider: {svc.provider}  |  Model: {svc.model}\n")

    # Test initial questions
    result = await svc.generate_initial_questions("AI-powered DevOps and incident response automation")
    print(f"Intro: {result.get('intro', '')}\n")
    for q in result.get("questions", [])[:3]:
        print(f"Q: {q['question']}")
        for s in q.get("suggestions", []):
            print(f"   • {s}")

    print("\n--- Streaming section draft ---")
    async for token in svc.draft_section_stream(
        heading="Automated Incident Response",
        bullet_points=["AI detects anomalies in real time", "Auto-remediation runbooks", "Reduced MTTR"],
        context="Blog post about AI in DevOps",
        word_count=150,
    ):
        print(token, end="", flush=True)
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    print(f"Testing Gemini text generation — model: {MODEL}")

    # Sync test (no await needed)
    test_sync_chat_with_history()

    # Async tests
    await test_async_streaming()
    await test_json_outline()
    await test_async_multiturn()
    await test_system_instruction()
    await test_via_service()

    print("\n" + "="*60)
    print("  All Gemini tests completed.")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())

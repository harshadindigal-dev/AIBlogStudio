"""Quick test for GPT-5 image generation via the Responses API with tool use."""

import base64
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env")

client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    timeout=httpx.Timeout(180.0, connect=10.0),
)

print("Sending image generation request to GPT-5 …")
response = client.responses.create(
    model="gpt-5",
    input="Draw a modern flat-style infographic about AI funding with a pie chart, bold labels, and a tech color palette.",
    tools=[{"type": "image_generation", "size": "1024x1024", "quality": "low"}],
)

image_data = [
    output.result
    for output in response.output
    if output.type == "image_generation_call"
]

if not image_data:
    print("ERROR: No image_generation_call found in response output.")
    print("Response output types:", [o.type for o in response.output])
    raise SystemExit(1)

b64 = image_data[0]
out_path = Path(__file__).resolve().parent / "test_output.png"
out_path.write_bytes(base64.b64decode(b64))
print(f"Image saved to {out_path}  ({out_path.stat().st_size:,} bytes)")

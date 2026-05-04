"""
Blog generation router — text drafting, image generation (OpenAI + Gemini),
automated content planning, export, and lightweight project persistence.
"""

from __future__ import annotations

import io
import json
import logging
import re
import time
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.blog_service import (
    BLOG_PROJECTS_DIR,
    BlogImageService,
    BlogPlannerService,
    BlogTextService,
)

router = APIRouter(prefix="/api/blog", tags=["blog"])

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    system: Optional[str] = None
    provider: str = "openai"           # "openai" | "claude" | "gemini"
    model: Optional[str] = None        # None → use provider default

class SuggestionsRequest(BaseModel):
    messages: List[Dict[str, str]]
    system: Optional[str] = None
    provider: str = "openai"
    model: Optional[str] = None

class InitialQuestionsRequest(BaseModel):
    blog_idea: str
    provider: str = "openai"
    model: Optional[str] = None

class OutlineRequest(BaseModel):
    topic: str
    audience: str = ""
    tone: str = "professional"
    num_sections: int = 5
    provider: str = "openai"
    model: Optional[str] = None

class DraftSectionRequest(BaseModel):
    heading: str
    bullet_points: List[str] = Field(default_factory=list)
    context: str = ""
    tone: str = "professional"
    word_count: int = 300
    provider: str = "openai"
    model: Optional[str] = None

class ImageGenRequest(BaseModel):
    prompt: str
    provider: str = "openai"          # "openai" | "gemini"
    style: str = ""
    size: str = "1024x1024"
    quality: str = "medium"
    blog_id: Optional[str] = None

class RefineOutlineRequest(BaseModel):
    outline: Dict[str, Any]
    feedback: str
    provider: str = "openai"
    model: Optional[str] = None

class AutoPlanRequest(BaseModel):
    company_name: str
    company_description: str
    topics: List[str]
    audience: str = ""
    posts_per_week: int = 2
    weeks: int = 4
    text_provider: str = "openai"     # "openai" | "claude" | "gemini"
    text_model: Optional[str] = None

class AutoGenerateRequest(BaseModel):
    entry: Dict[str, Any]
    company_name: str
    audience: str = ""
    image_provider: str = "openai"
    text_provider: str = "openai"
    text_model: Optional[str] = None

class BlogProjectUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    sections: Optional[List[Dict[str, Any]]] = None
    images: Optional[List[Dict[str, Any]]] = None
    meta_description: Optional[str] = None
    mode: Optional[str] = None

class ExportRequest(BaseModel):
    project_id: str
    format: str = "markdown"         # "markdown" | "html" | "zip"


# ---------------------------------------------------------------------------
# Text endpoints
# ---------------------------------------------------------------------------

@router.post("/chat")
async def blog_chat(req: ChatRequest):
    """Streaming chat completions for brainstorming / Q&A."""
    svc = BlogTextService(provider=req.provider, model=req.model)

    async def event_stream():
        async for token in svc.chat_stream(req.messages, system=req.system):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/chat-initial-questions")
async def blog_chat_initial_questions(req: InitialQuestionsRequest):
    """Return 5 structured follow-up questions (each with 3 suggestions) for a blog idea."""
    svc = BlogTextService(provider=req.provider, model=req.model)
    result = await svc.generate_initial_questions(req.blog_idea)
    return result


@router.post("/chat-suggestions")
async def blog_chat_suggestions(req: SuggestionsRequest):
    """Generate 3 suggested answers to the latest assistant question."""
    svc = BlogTextService(provider=req.provider, model=req.model)
    suggestions = await svc.generate_suggestions(req.messages, system=req.system)
    return {"suggestions": suggestions}


@router.post("/outline")
async def blog_outline(req: OutlineRequest):
    svc = BlogTextService(provider=req.provider, model=req.model)
    outline = await svc.generate_outline(
        topic=req.topic,
        audience=req.audience,
        tone=req.tone,
        num_sections=req.num_sections,
    )
    return {"status": "success", "outline": outline}


@router.post("/draft-section")
async def blog_draft_section(req: DraftSectionRequest):
    """Stream-draft a single blog section."""
    svc = BlogTextService(provider=req.provider, model=req.model)

    async def event_stream():
        async for token in svc.draft_section_stream(
            heading=req.heading,
            bullet_points=req.bullet_points,
            context=req.context,
            tone=req.tone,
            word_count=req.word_count,
        ):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/refine-outline")
async def blog_refine_outline(req: RefineOutlineRequest):
    svc = BlogTextService(provider=req.provider, model=req.model)
    refined = await svc.refine_outline(outline=req.outline, feedback=req.feedback)
    return {"status": "success", "outline": refined}


# ---------------------------------------------------------------------------
# Image generation
# ---------------------------------------------------------------------------

@router.post("/generate-image")
async def blog_generate_image(req: ImageGenRequest):
    svc = BlogImageService()
    t0 = time.time()
    log.info("[ROUTE] generate-image called provider=%s size=%s blog_id=%s", req.provider, req.size, req.blog_id)
    try:
        result = await svc.generate(
            prompt=req.prompt,
            provider=req.provider,
            style=req.style,
            size=req.size,
            quality=req.quality,
            blog_id=req.blog_id,
        )
        log.info("[ROUTE] generate-image SUCCESS in %.1fs", time.time() - t0)
        return {"status": "success", **result}
    except Exception as e:
        log.error("[ROUTE] generate-image ERROR after %.1fs: %s", time.time() - t0, e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Autopilot endpoints
# ---------------------------------------------------------------------------

@router.post("/auto-plan")
async def blog_auto_plan(req: AutoPlanRequest):
    planner = BlogPlannerService(text_provider=req.text_provider)
    plan = await planner.generate_plan(
        company_name=req.company_name,
        company_description=req.company_description,
        topics=req.topics,
        audience=req.audience,
        posts_per_week=req.posts_per_week,
        weeks=req.weeks,
    )
    return {"status": "success", "plan": plan}


@router.post("/auto-generate")
async def blog_auto_generate(req: AutoGenerateRequest):
    planner = BlogPlannerService(text_provider=req.text_provider)
    project = await planner.generate_post(
        entry=req.entry,
        company_name=req.company_name,
        audience=req.audience,
        image_provider=req.image_provider,
    )
    return {"status": "success", "project": project}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def _section_image_ids(section: Dict[str, Any]) -> List[str]:
    """Return image IDs from a section, handling both camelCase and snake_case keys."""
    return section.get("image_ids") or section.get("imageIds") or []


def _md_img_to_html(content: str) -> str:
    """Convert markdown image syntax to HTML img tags (needed for HTML export)."""
    return re.sub(
        r'!\[([^\]]*)\]\(([^)]+)\)',
        r'<img src="\2" alt="\1" style="max-width:100%;border-radius:8px;margin:1rem 0;display:block;"/>',
        content,
    )


def _substitute_b64_refs(content: str, images: List[Dict[str, Any]]) -> str:
    """Replace embedded base64 data URIs with relative image paths (for zip export)."""
    for img in images:
        if img and img.get("b64") and img.get("id"):
            content = content.replace(
                f"data:image/png;base64,{img['b64']}",
                f"images/{img['id']}.png",
            )
    return content


def _project_to_markdown(project: Dict[str, Any]) -> str:
    lines = [f"# {project.get('title', 'Untitled')}\n"]
    subtitle = project.get("subtitle")
    if subtitle:
        lines.append(f"*{subtitle}*\n")
    lines.append("")

    # Hero image — autopilot stores images at project level, not in section content
    if project.get("mode") == "autopilot":
        for img in project.get("images", []):
            if img and img.get("id"):
                lines.append(f"![{img.get('alt', 'hero image')}](images/{img['id']}.png)\n")
                break  # only the hero

    for section in project.get("sections", []):
        lines.append(f"## {section['heading']}\n")
        lines.append(section.get("content", "") + "\n")
        lines.append("")
    return "\n".join(lines)


def _project_to_html(project: Dict[str, Any]) -> str:
    title = project.get("title", "Untitled")
    subtitle = project.get("subtitle", "")
    body_parts = [f"<h1>{title}</h1>"]
    if subtitle:
        body_parts.append(f"<p><em>{subtitle}</em></p>")

    # Hero image for autopilot mode
    if project.get("mode") == "autopilot":
        for img in project.get("images", []):
            if img and img.get("id"):
                body_parts.append(
                    f'<img src="images/{img["id"]}.png" alt="{img.get("alt", "hero image")}"'
                    f' style="max-width:100%;border-radius:8px;margin:1rem 0;display:block;"/>'
                )
                break

    for section in project.get("sections", []):
        body_parts.append(f"<h2>{section['heading']}</h2>")
        # Convert markdown image syntax to <img> tags before splitting paragraphs
        content = _md_img_to_html(section.get("content", ""))
        for para in content.split("\n\n"):
            stripped = para.strip()
            if not stripped:
                continue
            # Don't double-wrap already-converted img tags in <p>
            if stripped.startswith("<img"):
                body_parts.append(stripped)
            else:
                body_parts.append(f"<p>{stripped}</p>")

    body = "\n".join(body_parts)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="description" content="{project.get('meta_description', '')}"/>
<title>{title}</title>
<style>
body {{ max-width: 720px; margin: 2rem auto; font-family: Georgia, serif; line-height: 1.7; color: #1a1a1a; padding: 0 1rem; }}
h1 {{ font-size: 2.2rem; margin-bottom: 0.3rem; }}
h2 {{ font-size: 1.5rem; margin-top: 2rem; }}
img {{ border-radius: 8px; margin: 1rem 0; }}
</style>
</head>
<body>
{body}
</body>
</html>"""


@router.post("/export")
async def blog_export(req: ExportRequest):
    path = BLOG_PROJECTS_DIR / f"{req.project_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Project not found")
    project = json.loads(path.read_text())

    if req.format == "markdown":
        md = _project_to_markdown(project)
        return StreamingResponse(
            iter([md]),
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={req.project_id}.md"},
        )
    elif req.format == "html":
        html = _project_to_html(project)
        return StreamingResponse(
            iter([html]),
            media_type="text/html",
            headers={"Content-Disposition": f"attachment; filename={req.project_id}.html"},
        )
    elif req.format == "zip":
        all_images = [img for img in project.get("images", []) if img and img.get("id")]
        # Replace embedded base64 data URIs with relative file paths so the zip
        # is self-consistent: markdown/html reference images/*.png, not inline blobs
        md = _substitute_b64_refs(_project_to_markdown(project), all_images)
        html = _substitute_b64_refs(_project_to_html(project), all_images)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("post.md", md)
            zf.writestr("post.html", html)
            import base64
            for img in all_images:
                if img.get("b64"):
                    zf.writestr(f"images/{img['id']}.png", base64.b64decode(img["b64"]))
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={req.project_id}.zip"},
        )
    else:
        raise HTTPException(status_code=400, detail="format must be markdown, html, or zip")


# ---------------------------------------------------------------------------
# Project persistence (lightweight file-based)
# ---------------------------------------------------------------------------

@router.get("/projects")
async def list_projects():
    projects = []
    for p in sorted(BLOG_PROJECTS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        data = json.loads(p.read_text())
        projects.append({
            "id": data.get("id", p.stem),
            "title": data.get("title", "Untitled"),
            "mode": data.get("mode", "writer"),
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at"),
            "section_count": len(data.get("sections", [])),
            "image_count": len(data.get("images", [])),
        })
    return {"status": "success", "projects": projects}


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    path = BLOG_PROJECTS_DIR / f"{project_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "success", "project": json.loads(path.read_text())}


@router.put("/projects/{project_id}")
async def save_project(project_id: str, body: BlogProjectUpdate):
    path = BLOG_PROJECTS_DIR / f"{project_id}.json"
    if path.is_file():
        project = json.loads(path.read_text())
    else:
        project = {
            "id": project_id,
            "created_at": datetime.utcnow().isoformat(),
        }
    updates = body.model_dump(exclude_none=True)
    project.update(updates)
    project["updated_at"] = datetime.utcnow().isoformat()
    path.write_text(json.dumps(project, indent=2))
    return {"status": "success", "project": project}


@router.post("/projects")
async def create_project():
    """Create a new empty blog project."""
    project_id = uuid.uuid4().hex
    project = {
        "id": project_id,
        "title": "Untitled Blog Post",
        "subtitle": "",
        "mode": "writer",
        "sections": [],
        "images": [],
        "meta_description": "",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    (BLOG_PROJECTS_DIR / f"{project_id}.json").write_text(json.dumps(project, indent=2))
    return {"status": "success", "project": project}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from routers import blog

app = FastAPI(title="Blog Studio API")

app.include_router(blog.router)

os.makedirs("blog_assets", exist_ok=True)
os.makedirs("blog_projects", exist_ok=True)
app.mount("/blog-assets", StaticFiles(directory="blog_assets"), name="blog_assets")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

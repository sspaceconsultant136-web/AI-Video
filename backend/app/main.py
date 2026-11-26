import json
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from PIL import Image
import httpx
import subprocess

from app.core import settings
from app.db import Base, engine, get_db
from app.models import User, UploadedImage, Video, VideoScene, GenerationJob
from app.security import hash_password, verify_password, token, current_user, admin_user
from app.worker import process, EFFECTS, TRANSITIONS

Base.metadata.create_all(bind=engine)


def recover_interrupted_jobs():
    """A restart/crash kills running renders; mark them failed instead of 'processing' forever."""
    from app.db import SessionLocal
    message = "Server restarted while this video was being created. Please generate it again."
    db = SessionLocal()
    try:
        for video in db.query(Video).filter(Video.status.in_(["pending", "processing"])).all():
            video.status, video.error = "failed", message
        for job in db.query(GenerationJob).filter(GenerationJob.status.in_(["pending", "processing"])).all():
            job.status, job.error = "failed", message
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


recover_interrupted_jobs()
app = FastAPI(title=settings.app_name, version="1.1.0")
# CORS: include both common local frontend origins explicitly.
# Keep configured origins for deployments, and normalize trailing slashes.
_configured_origins = getattr(settings, "cors_list", []) or []
if isinstance(_configured_origins, str):
    _configured_origins = [
        item.strip() for item in _configured_origins.split(",") if item.strip()
    ]

_allowed_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}
for _origin in _configured_origins:
    if isinstance(_origin, str) and _origin.strip():
        _allowed_origins.add(_origin.strip().rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(_allowed_origins),
    # Allow localhost/127.0.0.1 dev origins on any port (e.g. Vite preview).
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Register(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = ""


class Login(BaseModel):
    email: EmailStr
    password: str


class Generate(BaseModel):
    mode: str
    image_id: int
    prompt: str = ""
    script: str = ""
    voiceover_text: str = ""
    voice_id: str = "en-IN-NeerjaNeural"
    effect: str = "zoom_in"
    duration: int = Field(default=5, ge=5, le=60)
    resolution: str = "720p"
    aspect_ratio: str = "9:16"


class Script(BaseModel):
    topic: str
    language: str = "English"
    tone: str = "professional"
    duration: int = 30


class Preview(BaseModel):
    text: str = Field(min_length=1, max_length=3000)
    voice_id: str = "en-IN-NeerjaNeural"


VOICE_CATALOG = [
    {"id": "en-IN-NeerjaNeural", "name": "Neerja", "language": "English (India)", "gender": "Female"},
    {"id": "en-IN-PrabhatNeural", "name": "Prabhat", "language": "English (India)", "gender": "Male"},
    {"id": "hi-IN-SwaraNeural", "name": "Swara", "language": "Hindi (India)", "gender": "Female"},
    {"id": "hi-IN-MadhurNeural", "name": "Madhur", "language": "Hindi (India)", "gender": "Male"},
    {"id": "en-US-AriaNeural", "name": "Aria", "language": "English (US)", "gender": "Female"},
    {"id": "en-US-GuyNeural", "name": "Guy", "language": "English (US)", "gender": "Male"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia", "language": "English (UK)", "gender": "Female"},
    {"id": "en-GB-RyanNeural", "name": "Ryan", "language": "English (UK)", "gender": "Male"},
]


def save_upload(file: UploadFile, data: bytes, user_id: int, db: Session):
    extensions = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    if file.content_type not in extensions:
        raise HTTPException(415, f"{file.filename}: only JPG, PNG and WEBP are supported")
    if not data or len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"{file.filename}: image exceeds {settings.max_upload_mb} MB limit")
    path = Path(settings.upload_dir) / (uuid4().hex + extensions[file.content_type])
    path.write_bytes(data)
    try:
        with Image.open(path) as image:
            image.verify()
    except Exception:
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"{file.filename}: invalid image file")
    item = UploadedImage(user_id=user_id, filename=file.filename or path.name, path=str(path), content_type=file.content_type)
    db.add(item)
    db.flush()
    return item


@app.get("/")
def root():
    return {"name": settings.app_name, "status": "online", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register(x: Register, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=x.email.lower()).first():
        raise HTTPException(409, "Email already registered")
    user = User(email=x.email.lower(), full_name=x.full_name, hashed_password=hash_password(x.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": token(user.id), "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin}}


@app.post("/api/auth/login")
def login(x: Login, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=x.email.lower()).first()
    if not user or not verify_password(x.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(403, "Account deactivated")
    return {"access_token": token(user.id), "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin}}


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "is_admin": user.is_admin}


@app.post("/api/images/upload")
async def upload(file: UploadFile = File(...), user=Depends(current_user), db: Session = Depends(get_db)):
    data = await file.read()
    item = save_upload(file, data, user.id, db)
    db.commit()
    return {"id": item.id, "filename": item.filename}


def serial(video: Video, db: Session | None = None):
    result = {
        "id": video.id,
        "title": video.title,
        "mode": video.mode,
        "status": video.status,
        "prompt": video.prompt,
        "duration": video.duration,
        "resolution": video.resolution,
        "aspect_ratio": video.aspect_ratio,
        "error": video.error,
        "created_at": video.created_at.isoformat(),
        "download_url": f"/api/videos/{video.id}/download" if video.output_path and video.status == "completed" else None,
    }
    if db is not None:
        scenes = db.query(VideoScene).filter_by(video_id=video.id).order_by(VideoScene.position).all()
        result["scenes"] = [{"position": s.position, "image_id": s.image_id, "prompt": s.prompt, "duration": s.duration} for s in scenes]
        result["scene_count"] = len(scenes)
    return result


def create_job(x: Generate, user, db: Session, background_tasks: BackgroundTasks):
    if x.mode not in ("image_to_video", "talking_avatar", "marketing"):
        raise HTTPException(400, "Unsupported generation mode")
    if x.resolution not in ("720p", "1080p") or x.aspect_ratio not in ("9:16", "1:1", "16:9"):
        raise HTTPException(400, "Unsupported output settings")
    image = db.query(UploadedImage).filter_by(id=x.image_id, user_id=user.id).first()
    if not image:
        raise HTTPException(404, "Image not found")
    narration = (x.voiceover_text or x.script).strip()
    if x.mode != "marketing" and not x.prompt and not narration:
        raise HTTPException(400, "Add a prompt or script")
    if len(narration) > 10000:
        raise HTTPException(400, "Voiceover text cannot exceed 10,000 characters")
    if narration and x.voice_id not in {v["id"] for v in VOICE_CATALOG}:
        raise HTTPException(400, "Select a supported AI voice")
    # Same JSON format as the multi-image endpoint, so the worker reads the chosen voice.
    if x.effect not in EFFECTS:
        raise HTTPException(400, "Unsupported motion effect")
    script_config = json.dumps({"voiceover_text": narration, "voice_id": x.voice_id, "effect": x.effect})
    video = Video(user_id=user.id, image_id=image.id, title=x.prompt[:80] or x.mode, mode=x.mode, prompt=x.prompt, script=script_config, image_path=image.path, duration=x.duration, resolution=x.resolution, aspect_ratio=x.aspect_ratio)
    db.add(video)
    db.commit()
    db.refresh(video)
    db.add(GenerationJob(video_id=video.id))
    db.commit()
    background_tasks.add_task(process, video.id)
    return serial(video, db)


@app.post("/api/videos/generate")
def generate(x: Generate, background_tasks: BackgroundTasks, user=Depends(current_user), db: Session = Depends(get_db)):
    return create_job(x, user, db, background_tasks)


@app.post("/api/videos/talking-avatar")
def talking(x: Generate, background_tasks: BackgroundTasks, user=Depends(current_user), db: Session = Depends(get_db)):
    if x.mode != "talking_avatar":
        raise HTTPException(400, "mode must be talking_avatar")
    return create_job(x, user, db, background_tasks)


@app.post("/api/videos/multi-image")
async def create_multi_image_video(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    scenes: str = Form(...),
    generation_method: str = Form("slideshow"),
    resolution: str = Form("720p"),
    aspect_ratio: str = Form("9:16"),
    title: str = Form("Multi-image video"),
    voiceover_text: str = Form(""),
    voice_id: str = Form("en-IN-NeerjaNeural"),
    transition: str = Form("fade"),
    transition_seconds: float = Form(0.8),
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    if not 2 <= len(files) <= 20:
        raise HTTPException(400, "Upload between 2 and 20 images")
    if generation_method not in ("slideshow", "ai_motion"):
        raise HTTPException(400, "generation_method must be slideshow or ai_motion")
    if resolution not in ("720p", "1080p") or aspect_ratio not in ("9:16", "1:1", "16:9"):
        raise HTTPException(400, "Unsupported output settings")
    if voiceover_text.strip() and voice_id not in {v["id"] for v in VOICE_CATALOG}:
        raise HTTPException(400, "Select a supported AI voice")
    if transition not in TRANSITIONS:
        raise HTTPException(400, "Unsupported transition")
    if not 0.2 <= transition_seconds <= 1.5:
        raise HTTPException(400, "Transition length must be between 0.2 and 1.5 seconds")
    if len(voiceover_text) > 10000:
        raise HTTPException(400, "Voiceover text cannot exceed 10,000 characters")
    try:
        scene_data = json.loads(scenes)
    except json.JSONDecodeError:
        raise HTTPException(400, "Scene settings must be valid JSON")
    if not isinstance(scene_data, list) or len(scene_data) != len(files):
        raise HTTPException(400, "Provide one scene setting for each image")

    validated = []
    total_duration = 0
    for index, scene in enumerate(scene_data):
        try:
            duration = int(scene.get("duration", 5))
        except (TypeError, ValueError):
            raise HTTPException(400, f"Scene {index + 1}: duration must be a number")
        if not 2 <= duration <= 60:
            raise HTTPException(400, f"Scene {index + 1}: duration must be between 2 and 60 seconds")
        prompt = str(scene.get("prompt", ""))[:2000]
        effect = str(scene.get("effect", "auto"))
        if effect not in EFFECTS:
            raise HTTPException(400, f"Scene {index + 1}: unsupported motion effect")
        total_duration += duration
        validated.append({"duration": duration, "prompt": prompt, "effect": effect})
    if total_duration > 300:
        raise HTTPException(400, "Total video duration cannot exceed 300 seconds")

    uploaded = []
    try:
        for file in files:
            uploaded.append(save_upload(file, await file.read(), user.id, db))
        first = uploaded[0]
        mode = "multi_image_ai" if generation_method == "ai_motion" else "multi_image_slideshow"
        video = Video(
            user_id=user.id,
            image_id=first.id,
            title=(title or "Multi-image video")[:255],
            mode=mode,
            prompt=f"{len(uploaded)} scenes · {generation_method}",
            script=json.dumps({
                "voiceover_text": voiceover_text.strip(),
                "voice_id": voice_id,
                "effects": [scene["effect"] for scene in validated],
                "transition": transition,
                "transition_seconds": transition_seconds,
            }),
            image_path=first.path,
            duration=total_duration,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
        )
        db.add(video)
        db.flush()
        for position, (image, scene) in enumerate(zip(uploaded, validated)):
            db.add(VideoScene(video_id=video.id, image_id=image.id, image_path=image.path, position=position, prompt=scene["prompt"], duration=scene["duration"]))
        db.add(GenerationJob(video_id=video.id))
        db.commit()
        db.refresh(video)
    except Exception:
        db.rollback()
        for image in uploaded:
            Path(image.path).unlink(missing_ok=True)
        raise

    background_tasks.add_task(process, video.id)
    return serial(video, db)


@app.get("/api/videos/history")
def history(user=Depends(current_user), db: Session = Depends(get_db)):
    videos = db.query(Video).filter_by(user_id=user.id).order_by(Video.created_at.desc()).limit(100).all()
    return [serial(video, db) for video in videos]


@app.get("/api/videos/{vid}")
def get_video(vid: int, user=Depends(current_user), db: Session = Depends(get_db)):
    video = db.query(Video).filter_by(id=vid, user_id=user.id).first()
    if not video:
        raise HTTPException(404, "Video not found")
    return serial(video, db)


@app.get("/api/videos/{vid}/download")
def download(vid: int, user=Depends(current_user), db: Session = Depends(get_db)):
    video = db.query(Video).filter_by(id=vid, user_id=user.id).first()
    if not video or not video.output_path or not Path(video.output_path).exists():
        raise HTTPException(404, "Video file unavailable")
    return FileResponse(video.output_path, media_type="video/mp4", filename=f"space-consultant-{vid}.mp4")


@app.delete("/api/videos/{vid}")
def delete_video(vid: int, user=Depends(current_user), db: Session = Depends(get_db)):
    video = db.query(Video).filter_by(id=vid, user_id=user.id).first()
    if not video:
        raise HTTPException(404, "Video not found")
    scenes = db.query(VideoScene).filter_by(video_id=vid).all()
    paths = {video.output_path, *(scene.image_path for scene in scenes)}
    for path in paths:
        if path:
            Path(path).unlink(missing_ok=True)
    db.query(VideoScene).filter_by(video_id=vid).delete()
    db.query(GenerationJob).filter_by(video_id=vid).delete()
    db.delete(video)
    db.commit()
    return {"message": "deleted"}


@app.get("/api/voices")
def voices(user=Depends(current_user)):
    return [{**voice, "available": True, "provider": "Microsoft Edge TTS"} for voice in VOICE_CATALOG]


@app.post("/api/voices/preview")
async def voice_preview(x: Preview, user=Depends(current_user)):
    if x.voice_id not in {v["id"] for v in VOICE_CATALOG}:
        raise HTTPException(400, "Unsupported voice selection")
    out = str(Path(settings.output_dir) / (uuid4().hex + ".mp3"))
    try:
        import edge_tts
        await edge_tts.Communicate(x.text, x.voice_id).save(out)
        if not Path(out).exists() or Path(out).stat().st_size == 0:
            raise RuntimeError("Voice provider returned an empty audio file")
    except Exception as exc:
        Path(out).unlink(missing_ok=True)
        raise HTTPException(503, f"AI voice preview failed: {exc}")
    return FileResponse(
        out, media_type="audio/mpeg", filename="voice-preview.mp3",
        background=BackgroundTask(lambda: Path(out).unlink(missing_ok=True)),
    )


@app.post("/api/scripts/generate")
async def make_script(x: Script, user=Depends(current_user)):
    if not settings.llm_base_url or not settings.llm_model:
        raise HTTPException(503, "Configure LLM_BASE_URL and LLM_MODEL")
    headers = {"Content-Type": "application/json"}
    if settings.llm_api_key:
        headers["Authorization"] = "Bearer " + settings.llm_api_key
    payload = {"model": settings.llm_model, "messages": [{"role": "system", "content": "Write concise natural voiceover scripts; do not invent facts."}, {"role": "user", "content": f"Write a {x.duration}-second {x.tone} video script in {x.language} about {x.topic}. Spoken words only."}]}
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(settings.llm_base_url.rstrip("/") + "/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            return {"script": response.json()["choices"][0]["message"]["content"].strip()}
    except Exception as exc:
        raise HTTPException(503, str(exc))


@app.get("/api/admin/dashboard")
def admin_dashboard(admin=Depends(admin_user), db: Session = Depends(get_db)):
    return {"users": db.query(User).count(), "videos": db.query(Video).count(), "completed": db.query(Video).filter_by(status="completed").count(), "failed": db.query(Video).filter_by(status="failed").count()}


@app.get("/api/admin/providers")
def admin_providers(admin=Depends(admin_user)):
    return [
        {"name": "Replicate image-to-video", "configured": bool(settings.replicate_api_token and settings.replicate_image_video_version)},
        {"name": "Edge TTS voices", "configured": True},
        {"name": "FFmpeg slideshow export", "configured": bool(settings.ffmpeg_bin)},
    ]

import shutil
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    app_name:str="Space Consultant AI Studio"
    secret_key:str="CHANGE_ME"
    access_token_expire_minutes:int=1440
    database_url:str="sqlite:///./studio.db"
    cors_origins:str="http://localhost:5173"
    upload_dir:str="uploads"
    output_dir:str="generated"
    max_upload_mb:int=15
    replicate_api_token:str=""
    replicate_image_video_version:str=""
    replicate_talking_avatar_version:str=""
    llm_base_url:str=""
    llm_api_key:str=""
    llm_model:str=""
    piper_bin:str="piper"
    piper_voice_model:str=""
    ffmpeg_bin:str="ffmpeg"
    model_config=SettingsConfigDict(env_file=".env",extra="ignore")
    @property
    def cors_list(self): return [x.strip() for x in self.cors_origins.split(",") if x.strip()]
settings=Settings()
# Render/Neon give "postgres://" or "postgresql://" URLs. This project uses psycopg 3,
# so SQLAlchemy needs the "postgresql+psycopg://" form.
if settings.database_url.startswith(("postgres://","postgresql://")):
    settings.database_url=settings.database_url.replace("postgres://","postgresql+psycopg://",1).replace("postgresql://","postgresql+psycopg://",1)
# Use the system FFmpeg if there is one; otherwise fall back to the bundled binary
# from the imageio-ffmpeg package (needed on Render, which has no FFmpeg installed).
if not shutil.which(settings.ffmpeg_bin) and not Path(settings.ffmpeg_bin).exists():
    try:
        import imageio_ffmpeg
        settings.ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
Path(settings.upload_dir).mkdir(parents=True,exist_ok=True)
Path(settings.output_dir).mkdir(parents=True,exist_ok=True)

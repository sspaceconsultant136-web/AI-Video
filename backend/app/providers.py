import time
import base64
import mimetypes
import httpx
from pathlib import Path
from app.core import settings


class ReplicateProvider:
    def __init__(self, version):
        if not settings.replicate_api_token:
            raise RuntimeError("REPLICATE_API_TOKEN is not configured")
        if not version:
            raise RuntimeError("REPLICATE_IMAGE_VIDEO_VERSION is not configured")
        self.version = version

    def generate(self, image_path, prompt, output_path):
        image_file = Path(image_path)
        mime_type = mimetypes.guess_type(image_file.name)[0] or "image/jpeg"
        image_data = base64.b64encode(image_file.read_bytes()).decode("ascii")
        image_url = f"data:{mime_type};base64,{image_data}"
        headers = {
            "Authorization": f"Bearer {settings.replicate_api_token}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=60) as client:
            response = client.post(
                "https://api.replicate.com/v1/predictions",
                headers=headers,
                json={
                    "version": self.version,
                    "input": {
                        "image": image_url,
                        "prompt": prompt or "Natural cinematic motion",
                    },
                },
            )
            response.raise_for_status()
            poll_url = response.json().get("urls", {}).get("get")
            if not poll_url:
                raise RuntimeError("Provider returned no polling URL")
            deadline = time.time() + 900
            while time.time() < deadline:
                result = client.get(poll_url, headers=headers)
                result.raise_for_status()
                data = result.json()
                if data.get("status") == "succeeded":
                    output = data.get("output")
                    video_url = output[0] if isinstance(output, list) else output
                    if not isinstance(video_url, str):
                        raise RuntimeError("Provider returned an unsupported video output")
                    download = client.get(video_url, timeout=180)
                    download.raise_for_status()
                    Path(output_path).write_bytes(download.content)
                    return output_path
                if data.get("status") in ("failed", "canceled"):
                    raise RuntimeError(data.get("error") or "Provider job failed")
                time.sleep(4)
        raise RuntimeError("Provider generation timed out")

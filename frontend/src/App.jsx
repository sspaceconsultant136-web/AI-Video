import { useEffect, useRef, useState } from 'react';
import { NavLink, Routes, Route, useNavigate } from 'react-router-dom';
import {
  Sparkles, LayoutDashboard, WandSparkles, Folder, Mic, LogOut,
  Upload, Download, Trash2, Film, Image as ImageIcon, LoaderCircle,
  ArrowUp, ArrowDown, X, Images, Clapperboard, Volume2
} from 'lucide-react';
import api from './api';

// Download through Axios so the saved login token is sent with the request.
// A normal <a href="..."> request does not include the Authorization header.
async function downloadVideo(url, filename = 'space-consultant-video.mp4') {
  try {
    const response = await api.get(url, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  } catch (error) {
    if (error.response?.status === 401) {
      alert('Your session has expired. Please sign in again.');
    } else {
      alert(error.response?.data?.detail || 'Video download failed. Please try again.');
    }
  }
}



const effectOptions = [
  ['auto', 'Auto (mix of all)'], ['zoom_in', 'Zoom In'], ['zoom_out', 'Zoom Out'],
  ['pan_left', 'Pan Left'], ['pan_right', 'Pan Right'], ['none', 'No motion']
];
const transitionOptions = [
  ['fade', 'Fade'], ['dissolve', 'Dissolve'], ['fadeblack', 'Fade through black'],
  ['wipeleft', 'Wipe left'], ['wiperight', 'Wipe right'], ['slideleft', 'Slide left'],
  ['slideright', 'Slide right'], ['circleopen', 'Circle open'], ['zoomin', 'Zoom transition'],
  ['radial', 'Radial'], ['random', 'Random mix'], ['none', 'No transition (hard cut)']
];

const modes = [
  ['image_to_video', 'Image to Video', 'Animate a still image', ImageIcon],
  ['talking_avatar', 'Talking Avatar', 'Speaking portrait', Mic],
  ['marketing', 'AI Marketing Video', 'Promotional video', WandSparkles]
];

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('scai_user') || 'null'));
  const navigate = useNavigate();
  if (!user) return <Auth done={setUser} />;
  return <div className="shell">
    <aside>
      <div className="brand"><Sparkles /> SPACE CONSULTANT<br />AI STUDIO</div>
      <nav>
        <NavLink to="/" end><LayoutDashboard />Dashboard</NavLink>
        <NavLink to="/create"><WandSparkles />Create Video</NavLink>
        <NavLink to="/history"><Folder />My Videos</NavLink>
        <NavLink to="/voices"><Mic />Voice Studio</NavLink>
      </nav>
      <button className="logout" onClick={() => { localStorage.removeItem('scai_token'); localStorage.removeItem('scai_user'); setUser(null); navigate('/'); }}><LogOut />Sign out</button>
    </aside>
    <main>
      <header>Workspace / Studio <span>{user.full_name || user.email}</span></header>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create" element={<Create />} />
        <Route path="/history" element={<History />} />
        <Route path="/voices" element={<Voices />} />
      </Routes>
    </main>
  </div>;
}

function Auth({ done }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = (await api.post('/api/auth/' + mode, mode === 'login' ? { email, password } : { email, password, full_name: name })).data;
      localStorage.setItem('scai_token', result.access_token);
      localStorage.setItem('scai_user', JSON.stringify(result.user));
      done(result.user);
    } catch (err) { setError(err.response?.data?.detail || 'Backend connection failed'); }
    finally { setBusy(false); }
  }
  return <div className="auth"><form onSubmit={submit}>
    <h1>✦ Space Consultant AI Studio</h1><h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
    {mode === 'register' && <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />}
    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
    <input type="password" placeholder="Password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
    {error && <p className="error">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Register'}</button>
    <a onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create account' : 'Back to login'}</a>
  </form></div>;
}

function Dashboard() {
  const [videos, setVideos] = useState([]);
  useEffect(() => { api.get('/api/videos/history').then(r => setVideos(r.data)).catch(() => {}); }, []);
  return <section>
    <h1>Creative dashboard</h1><p>Turn images and ideas into engaging videos.</p>
    <div className="stats">
      <article><b>{videos.length}</b><small>Total videos</small></article>
      <article><b>{videos.filter(v => v.status === 'completed').length}</b><small>Completed</small></article>
      <article><b>{videos.filter(v => ['pending', 'processing'].includes(v.status)).length}</b><small>In progress</small></article>
    </div>
    <h2>Choose your creation</h2>
    <div className="modes">{modes.map(([id, title, desc, Icon]) => <NavLink className="mode" to="/create" key={id}><Icon /><h3>{title}</h3><p>{desc}</p>Start creating →</NavLink>)}</div>
    <h2>Recent videos</h2><VideoList videos={videos.slice(0, 5)} />
  </section>;
}

function Create() {
  const [workflow, setWorkflow] = useState('multi');
  const [mode, setMode] = useState('image_to_video');
  const [method, setMethod] = useState('slideshow');
  const [singleFile, setSingleFile] = useState(null);
  const [singlePreview, setSinglePreview] = useState('');
  const [scenes, setScenes] = useState([]);
  const previewUrls = useRef(new Set());
  const [prompt, setPrompt] = useState('');
  const [script, setScript] = useState('');
  const [duration, setDuration] = useState(10);
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [job, setJob] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceList, setVoiceList] = useState([]);
  const [voiceId, setVoiceId] = useState('en-IN-NeerjaNeural');
  const [voiceoverText, setVoiceoverText] = useState('');
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const [transition, setTransition] = useState('fade');
  const [transitionSeconds, setTransitionSeconds] = useState(0.8);
  const [effect, setEffect] = useState('zoom_in');
  const [motionAll, setMotionAll] = useState('auto');

  useEffect(() => {
    api.get('/api/voices').then(r => setVoiceList(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!job?.id || ['completed', 'failed'].includes(job.status)) return;
    const timer = setInterval(() => api.get('/api/videos/' + job.id).then(r => setJob(r.data)).catch(() => {}), 3500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);

  useEffect(() => () => { if (singlePreview) URL.revokeObjectURL(singlePreview); }, [singlePreview]);
  useEffect(() => () => previewUrls.current.forEach(url => URL.revokeObjectURL(url)), []);

  function addFiles(event) {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    if (scenes.length + selected.length > 20) { setMessage('Maximum 20 images allowed.'); event.target.value = ''; return; }
    const accepted = selected.filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (accepted.length !== selected.length) setMessage('Only JPG, PNG and WEBP images are supported.');
    const next = accepted.map(file => { const preview = URL.createObjectURL(file); previewUrls.current.add(preview); return { key: `${file.name}-${file.lastModified}-${Math.random()}`, file, preview, prompt: '', duration: 5, effect: motionAll }; });
    setScenes(current => [...current, ...next]);
    setJob(null);
    event.target.value = '';
  }

  function updateScene(index, patch) { setScenes(current => current.map((scene, i) => i === index ? { ...scene, ...patch } : scene)); }
  function moveScene(index, direction) {
    setScenes(current => {
      const next = [...current]; const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function removeScene(index) {
    const removed = scenes[index];
    if (removed) { URL.revokeObjectURL(removed.preview); previewUrls.current.delete(removed.preview); }
    setScenes(current => current.filter((_, sceneIndex) => sceneIndex !== index));
  }

  async function submitSingle(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setJob(null);
    try {
      if (!singleFile) throw new Error('Choose an image first');
      const form = new FormData(); form.append('file', singleFile);
      const uploaded = (await api.post('/api/images/upload', form)).data;
      const path = mode === 'talking_avatar' ? '/api/videos/talking-avatar' : '/api/videos/generate';
      const result = (await api.post(path, {
        mode,
        image_id: uploaded.id,
        prompt,
        script: mode === 'image_to_video' ? '' : script,
        voiceover_text: mode === 'image_to_video' ? '' : script,
        voice_id: voiceId,
        effect,
        duration,
        resolution,
        aspect_ratio: ratio
      })).data;
      setJob(result); setMessage('Generation job submitted.');
    } catch (err) { setMessage(err.response?.data?.detail || err.message || 'Generation failed'); }
    finally { setBusy(false); }
  }

  async function submitMulti(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setJob(null);
    try {
      if (scenes.length < 2 || scenes.length > 20) throw new Error('Add between 2 and 20 images.');
      const form = new FormData();
      scenes.forEach(scene => form.append('files', scene.file, scene.file.name));
      form.append('scenes', JSON.stringify(scenes.map(scene => ({ prompt: scene.prompt, duration: Number(scene.duration), effect: scene.effect || 'auto' }))));
      form.append('generation_method', method);
      form.append('resolution', resolution);
      form.append('aspect_ratio', ratio);
      form.append('title', 'Space Consultant multi-scene video');
      form.append('voiceover_text', voiceoverText);
      form.append('voice_id', voiceId);
      form.append('transition', transition);
      form.append('transition_seconds', String(transitionSeconds));
      const result = (await api.post('/api/videos/multi-image', form)).data;
      setJob(result); setMessage(method === 'slideshow' ? 'Slideshow export queued. FFmpeg will combine your scenes.' : 'AI motion job queued. Each scene will be animated before being combined.');
    } catch (err) { setMessage(err.response?.data?.detail || err.message || 'Generation failed'); }
    finally { setBusy(false); }
  }

  return <section>
    <h1>Create video</h1><p>Build a video from one image or a multi-scene storyboard.</p>
    <div className="workflow-tabs">
      <button type="button" className={workflow === 'multi' ? 'tab active' : 'tab'} onClick={() => { setWorkflow('multi'); setJob(null); setMessage(''); }}><Images /> Multiple images (2–20)</button>
      <button type="button" className={workflow === 'single' ? 'tab active' : 'tab'} onClick={() => { setWorkflow('single'); setJob(null); setMessage(''); }}><ImageIcon /> Single image</button>
    </div>

    {workflow === 'multi' ? <form className="builder" onSubmit={submitMulti}>
      <h3>1. Add images to your storyboard</h3>
      <label className="upload"><Upload /> Select 2–20 JPG, PNG or WEBP images<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} /></label>
      <div className="scene-summary">{scenes.length} / 20 images added · Drag-free ordering with the up/down controls</div>
      <div className="scene-list">
        {scenes.map((scene, index) => <article className="scene-card" key={scene.key}>
          <div className="scene-head"><b>Scene {index + 1}</b><div className="scene-actions">
            <button type="button" title="Move up" disabled={index === 0} onClick={() => moveScene(index, -1)}><ArrowUp size={16} /></button>
            <button type="button" title="Move down" disabled={index === scenes.length - 1} onClick={() => moveScene(index, 1)}><ArrowDown size={16} /></button>
            <button type="button" title="Remove image" onClick={() => removeScene(index)}><X size={16} /></button>
          </div></div>
          <div className="scene-content"><img src={scene.preview} alt={`Scene ${index + 1}`} />
            <div className="scene-fields"><label>Scene prompt<textarea placeholder="Describe the motion or what should appear in this scene..." value={scene.prompt} onChange={e => updateScene(index, { prompt: e.target.value })} /></label>
              <label>Scene duration (seconds)<select value={scene.duration} onChange={e => updateScene(index, { duration: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 60].map(value => <option key={value} value={value}>{value}s</option>)}</select></label>
              {method === 'slideshow' && <label>Motion effect<select value={scene.effect || 'auto'} onChange={e => updateScene(index, { effect: e.target.value })}>{effectOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            </div>
          </div>
        </article>)}
      </div>
      <h3>2. Choose generation method</h3>
      <div className="method-grid">
        <button type="button" className={method === 'slideshow' ? 'method-card selected' : 'method-card'} onClick={() => setMethod('slideshow')}><Clapperboard /><b>AI Slideshow / Photo montage</b><small>FFmpeg creates a video from your images with gentle pan/zoom motion. No AI video API required.</small><span>Free-first</span></button>
        <button type="button" className={method === 'ai_motion' ? 'method-card selected' : 'method-card'} onClick={() => setMethod('ai_motion')}><WandSparkles /><b>AI Motion per scene</b><small>Replicate animates every image separately, then the clips are combined into one MP4.</small><span>Replicate API required</span></button>
      </div>
      <h3>Motion &amp; transitions</h3>
      <div className="row">
        {method === 'slideshow' && <label>Motion for all scenes<select value={motionAll} onChange={e => { setMotionAll(e.target.value); setScenes(current => current.map(scene => ({ ...scene, effect: e.target.value }))); }}>{effectOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <label>Transition between images<select value={transition} onChange={e => setTransition(e.target.value)}>{transitionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {transition !== 'none' && <label>Transition length<select value={transitionSeconds} onChange={e => setTransitionSeconds(Number(e.target.value))}>{[0.4, 0.6, 0.8, 1, 1.5].map(value => <option key={value} value={value}>{value}s</option>)}</select></label>}
      </div>
      <h3>3. AI voiceover (optional)</h3>
      <label>Choose AI voice<select value={voiceId} onChange={e => setVoiceId(e.target.value)}>{voiceList.map(voice => <option key={voice.id} value={voice.id}>{voice.name} — {voice.language} · {voice.gender}</option>)}</select></label>
      <label>Voiceover script<textarea placeholder="Write what the selected AI voice should speak. Leave blank for a silent video." value={voiceoverText} onChange={e => setVoiceoverText(e.target.value)} /></label>
      <button type="button" className="secondary" disabled={voicePreviewBusy || !voiceoverText.trim()} onClick={async () => { setVoicePreviewBusy(true); setMessage(''); try { const response = await api.post('/api/voices/preview', { text: voiceoverText, voice_id: voiceId }, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); audio.onerror = () => URL.revokeObjectURL(url); await audio.play(); } catch (err) { setMessage(err.response?.data?.detail || 'Voice preview failed'); } finally { setVoicePreviewBusy(false); } }}><Volume2 size={16} />{voicePreviewBusy ? 'Preparing voice...' : 'Preview selected voice'}</button>
      <p className="scene-summary">Select a voice and add narration. The video is automatically extended so the full script is spoken; if the script is shorter than your scenes, the rest stays silent.</p>
      <h3>4. Output settings</h3>
      <div className="row">
        <label>Resolution<select value={resolution} onChange={e => setResolution(e.target.value)}><option>720p</option><option>1080p</option></select></label>
        <label>Aspect ratio<select value={ratio} onChange={e => setRatio(e.target.value)}><option>9:16</option><option>1:1</option><option>16:9</option></select></label>
      </div>
      <p className="scene-summary">Total duration: {scenes.reduce((sum, scene) => sum + Number(scene.duration), 0)} seconds. Maximum total duration: 300 seconds.</p>
      {message && <p className="notice">{message}</p>}
      <button className="primary" disabled={busy || scenes.length < 2}>{busy ? <LoaderCircle /> : <Sparkles />}{busy ? 'Submitting...' : 'Generate one MP4 video'}</button>
    </form> : <form className="builder" onSubmit={submitSingle}>
      <h3>1. Generation mode</h3><div className="modes">{modes.map(([id, title, desc, Icon]) => <button type="button" className={mode === id ? 'mode chosen' : 'mode'} onClick={() => setMode(id)} key={id}><Icon /><b>{title}</b><small>{desc}</small></button>)}</div>
      <h3>2. Upload image</h3><label className="upload"><Upload /> Choose JPG, PNG or WEBP<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; setSingleFile(file || null); setSinglePreview(file ? URL.createObjectURL(file) : ''); }} /></label>
      {singlePreview && <img className="preview" src={singlePreview} alt="Uploaded preview" />}
      <h3>3. Prompt / script</h3><textarea placeholder="Describe the animation or marketing brief..." value={prompt} onChange={e => setPrompt(e.target.value)} />
      {mode !== 'image_to_video' && <>
        <label>Voiceover / avatar script<textarea placeholder="Write the exact words the AI voice should speak..." value={script} onChange={e => setScript(e.target.value)} /></label>
        <label>Choose AI voice<select value={voiceId} onChange={e => setVoiceId(e.target.value)}>{voiceList.map(voice => <option key={voice.id} value={voice.id}>{voice.name} — {voice.language} · {voice.gender}</option>)}</select></label>
      </>}
      <div className="row"><label>Motion effect<select value={effect} onChange={e => setEffect(e.target.value)}>{effectOptions.filter(([value]) => value !== 'auto').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Duration<select value={duration} onChange={e => setDuration(Number(e.target.value))}>{[5, 10, 15, 30, 60].map(value => <option key={value}>{value}</option>)}</select></label><label>Quality<select value={resolution} onChange={e => setResolution(e.target.value)}><option>720p</option><option>1080p</option></select></label><label>Ratio<select value={ratio} onChange={e => setRatio(e.target.value)}><option>9:16</option><option>1:1</option><option>16:9</option></select></label></div>
      {message && <p className="notice">{message}</p>}<button className="primary" disabled={busy}>{busy ? <LoaderCircle /> : <Sparkles />}{busy ? 'Submitting...' : 'Generate video'}</button>
    </form>}
    {job && <div className="job result-job"><b>Job #{job.id}</b><span className={'badge ' + job.status}>{job.status}</span>{job.error && <p className={job.status === 'completed' ? 'notice' : 'error'}>{job.status === 'completed' ? 'Voice note: ' : ''}{job.error}</p>}{job.download_url && <button type="button" className="primary" onClick={() => downloadVideo(job.download_url, `video-${job.id}.mp4`)}><Download /> Download MP4</button>}</div>}
  </section>;
}

function VideoList({ videos, onDelete }) {
  return videos.length ? <div className="list">{videos.map(video => <div className="item" key={video.id}><Film /><div><b>{video.title || 'Video ' + video.id}</b><small>{video.mode} · {video.scene_count ? `${video.scene_count} scenes · ` : ''}{video.duration}s · {video.resolution}</small>{video.status === 'completed' && video.error && <small style={{ display: 'block', color: '#f59e0b' }}>⚠ {video.error}</small>}</div><span className={'badge ' + video.status}>{video.status}</span>{video.download_url && <button type="button" aria-label={`Download video ${video.id}`} onClick={() => downloadVideo(video.download_url, `video-${video.id}.mp4`)}><Download /></button>}{onDelete && <button onClick={() => onDelete(video.id)}><Trash2 /></button>}</div>)}</div> : <div className="empty">No videos yet. Create your first video.</div>;
}

function History() {
  const [videos, setVideos] = useState([]); const [error, setError] = useState('');
  async function load() { try { setVideos((await api.get('/api/videos/history')).data); setError(''); } catch (err) { setError(err.response?.data?.detail || 'Unable to load history'); } }
  useEffect(() => { load(); }, []);
  async function remove(id) { if (!confirm('Delete this video?')) return; try { await api.delete('/api/videos/' + id); load(); } catch (err) { setError(err.response?.data?.detail || 'Delete failed'); } }
  return <section><h1>My videos</h1><p>Generation history and downloads.</p>{error && <p className="error">{error}</p>}<VideoList videos={videos} onDelete={remove} /></section>;
}

function Voices() {
  const [voices, setVoices] = useState([]);
  const [voiceId, setVoiceId] = useState('en-IN-NeerjaNeural');
  const [text, setText] = useState('Welcome to Space Consultant AI Studio.');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/api/voices').then(r => setVoices(r.data)).catch(err => setMessage(err.response?.data?.detail || 'Unable to load voices')); }, []);
  async function preview() {
    setBusy(true); setMessage('');
    try {
      const response = await api.post('/api/voices/preview', { text, voice_id: voiceId }, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => { URL.revokeObjectURL(url); setMessage('Unable to play voice preview'); };
      await audio.play();
    } catch (err) { setMessage(err.response?.data?.detail || 'AI voice preview failed'); }
    finally { setBusy(false); }
  }
  return <section><h1>AI Voice Studio</h1><p>Choose from multiple neural voices and preview them before using them in your video.</p>
    <div className="builder"><label>Select voice<select value={voiceId} onChange={e => setVoiceId(e.target.value)}>{voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name} — {voice.language} · {voice.gender}</option>)}</select></label>
    <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type text to hear a voice sample" />
    <button className="primary" onClick={preview} disabled={busy || !text.trim()}>{busy ? <LoaderCircle /> : <Volume2 />}{busy ? 'Preparing preview...' : 'Preview selected voice'}</button>
    <div className="voice-catalog">{voices.map(voice => <button type="button" className={voiceId === voice.id ? 'voice voice-selected' : 'voice'} key={voice.id} onClick={() => setVoiceId(voice.id)}><Mic /><b>{voice.name}</b><span>{voice.language} · {voice.gender}</span></button>)}</div>
    {message && <p className="notice">{message}</p>}</div>
  </section>;
}

export default App;

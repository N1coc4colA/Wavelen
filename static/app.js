(function () {
  'use strict';

  // ---------- DOM refs ----------
  const fileInput = document.getElementById('fileInput');
  const playlistEl = document.getElementById('playlist');
  const emptyState = document.getElementById('emptyState');
  const songCountEl = document.getElementById('songCount');

  const audio = document.getElementById('audioPlayer');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const progressSlider = document.getElementById('progressSlider');
  const currentTimeEl = document.getElementById('currentTime');
  const durationEl = document.getElementById('duration');
  const volumeSlider = document.getElementById('volumeSlider');
  const trackNameEl = document.getElementById('trackName');
  const trackSubEl = document.getElementById('trackSub');
  const albumArtEl = document.getElementById('albumArt');
  const coverImgEl = document.getElementById('coverImg');
  const albumFallbackEl = document.getElementById('albumFallback');
  const artBackdropEl = document.getElementById('artBackdrop');

  const queueToggle = document.getElementById('queueToggle');
  const queuePanel = document.getElementById('queuePanel');
  const queueBackdrop = document.getElementById('queueBackdrop');
  const themeToggle = document.getElementById('themeToggle');
  const iconSun = document.getElementById('iconSun');
  const iconMoon = document.getElementById('iconMoon');

  const uploadBtn = document.getElementById('uploadBtn');
  const addModalBackdrop = document.getElementById('addModalBackdrop');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const tabFileBtn = document.getElementById('tabFileBtn');
  const tabYoutubeBtn = document.getElementById('tabYoutubeBtn');
  const paneFile = document.getElementById('paneFile');
  const paneYoutube = document.getElementById('paneYoutube');
  const chooseFileBtn = document.getElementById('chooseFileBtn');
  const youtubeUrlInput = document.getElementById('youtubeUrl');
  const youtubeUserInput = document.getElementById('youtubeUser');
  const youtubePassInput = document.getElementById('youtubePass');
  const youtubeSubmitBtn = document.getElementById('youtubeSubmitBtn');
  const youtubeNote = document.getElementById('youtubeNote');

  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userDisplay = document.getElementById('userDisplay');
  const adminBtn = document.getElementById('adminBtn');
  const loginModalBackdrop = document.getElementById('loginModalBackdrop');
  const loginModalClose = document.getElementById('loginModalClose');
  const loginForm = document.getElementById('loginForm');
  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const adminModalBackdrop = document.getElementById('adminModalBackdrop');
  const adminModalClose = document.getElementById('adminModalClose');
  const userList = document.getElementById('userList');
  const addUserForm = document.getElementById('addUserForm');
  const newUsername = document.getElementById('newUsername');
  const newPassword = document.getElementById('newPassword');
  const newIsAdmin = document.getElementById('newIsAdmin');
  const addUserBtn = document.getElementById('addUserBtn');
  const adminError = document.getElementById('adminError');
  const youtubeLoginPrompt = document.getElementById('youtubeLoginPrompt');
  const youtubeLoginRequired = document.getElementById('youtubeLoginRequired');
  const youtubeContent = document.getElementById('youtubeContent');

  // ---------- State ----------
  let db = null;
  let songs = [];
  let currentIndex = -1;
  let isPlaying = false;
  let isDragging = false;

  let currentUser = null;
  let isAdmin = false;

  let draggedIndex = null;

  const DB_NAME = 'MusicPlayerDB';
  const STORE_NAME = 'songs';
  const DB_VERSION = 2;
  const THEME_KEY = 'wavelength-theme';

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* localStorage may be unavailable; theme just won't persist */
    }
    iconSun.classList.toggle('icon-hidden', theme !== 'dark');
    iconMoon.classList.toggle('icon-hidden', theme !== 'light');
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function initTheme() {
    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch (err) {
      /* ignore */
    }
    if (stored === 'light' || stored === 'dark') {
      applyTheme(stored);
      return;
    }
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ---------- IndexedDB helpers ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  function getAllSongs(database) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function addSong(database, record) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function deleteSong(database, id) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ---------- Metadata extraction ----------
  function stripExtension(name) {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(0, idx) : name;
  }

  // Reads ID3/MP4/FLAC tags from a File using jsmediatags (loaded via CDN in index.html).
  // Resolves to a plain object even on failure, so callers never need to catch.
  function readTags(file) {
    return new Promise((resolve) => {
      if (typeof window.jsmediatags === 'undefined') {
        resolve({});
        return;
      }
      window.jsmediatags.read(file, {
        onSuccess: (tag) => {
          const t = tag.tags || {};
          let picture = null;
          if (t.picture && t.picture.data && t.picture.data.length) {
            picture = {
              format: t.picture.format || 'image/jpeg',
              buffer: new Uint8Array(t.picture.data).buffer,
            };
          }
          resolve({
            title: t.title || null,
            artist: t.artist || null,
            album: t.album || null,
            picture,
          });
        },
        onError: () => resolve({}),
      });
    });
  }

  // Measures playback duration by loading the blob in a throwaway <audio> element.
  function readDuration(blobURL) {
    return new Promise((resolve) => {
      const probe = new Audio();
      const done = (val) => {
        probe.src = '';
        resolve(val);
      };
      probe.addEventListener('loadedmetadata', () => done(probe.duration || 0), { once: true });
      probe.addEventListener('error', () => done(0), { once: true });
      probe.src = blobURL;
    });
  }

  function pictureURLFor(song) {
    if (!song.pictureBuffer) return null;
    if (!song.pictureURL) {
      const blob = new Blob([song.pictureBuffer], { type: song.pictureFormat || 'image/jpeg' });
      song.pictureURL = URL.createObjectURL(blob);
    }
    return song.pictureURL;
  }

  function audioURLFor(song) {
    if (!song.blobURL) {
      const blob = new Blob([song.data], { type: 'audio/mpeg' });
      song.blobURL = URL.createObjectURL(blob);
    }
    return song.blobURL;
  }

  // ---------- UI rendering ----------
  function renderPlaylist() {
    playlistEl.innerHTML = '';
    const hasSongs = songs.length > 0;
    emptyState.style.display = hasSongs ? 'none' : 'flex';
    playlistEl.style.display = hasSongs ? 'flex' : 'none';
    songCountEl.textContent = `${songs.length} track${songs.length !== 1 ? 's' : ''}`;

    songs.forEach((song, idx) => {
      const li = document.createElement('li');
      const isCurrent = idx === currentIndex;
      li.className = 'playlist-item' + (isCurrent ? ' active' : '') + (isCurrent && isPlaying ? ' is-playing' : '');
      li.dataset.index = idx;
      li.draggable = true;

      // Drag handle
      const dragHandle = document.createElement('div');
      dragHandle.className = 'drag-handle';
      dragHandle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>';

      // Thumbnail / Cover
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const url = pictureURLFor(song);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        thumb.appendChild(img);
      } else {
        thumb.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      }

      // Track info
      const infoDiv = document.createElement('div');
      infoDiv.className = 'info';
      const nameSpan = document.createElement('div');
      nameSpan.className = 'name';
      nameSpan.textContent = song.title || stripExtension(song.name);
      const metaSpan = document.createElement('div');
      metaSpan.className = 'meta';
      metaSpan.textContent = song.album ? `${song.artist || 'Unknown artist'} — ${song.album}` : (song.artist || 'Unknown artist');

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(metaSpan);

      // Playing indicator or duration
      let statusContainer;
      if (isCurrent) {
        statusContainer = document.createElement('div');
        statusContainer.className = 'playing-indicator';
        statusContainer.innerHTML = '<span></span><span></span><span></span>';
      } else {
        statusContainer = document.createElement('span');
        statusContainer.className = 'duration';
        statusContainer.textContent = song.duration ? formatTime(song.duration) : '';
      }

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.setAttribute('aria-label', 'Remove track');
      deleteBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeSong(idx);
      });

      li.appendChild(dragHandle);
      li.appendChild(thumb);
      li.appendChild(infoDiv);
      li.appendChild(statusContainer);
      li.appendChild(deleteBtn);

      li.addEventListener('click', () => playSong(idx));

      // Drag and Drop Events
      li.addEventListener('dragstart', (e) => {
        draggedIndex = idx;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      li.addEventListener('dragend', () => {
        draggedIndex = null;
        li.classList.remove('dragging');
        document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('drag-over'));
      });

      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedIndex !== null && draggedIndex !== idx) {
          li.classList.add('drag-over');
        }
      });

      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
      });

      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (draggedIndex === null || draggedIndex === idx) return;

        // Move item in songs array
        const [movedSong] = songs.splice(draggedIndex, 1);
        songs.splice(idx, 0, movedSong);

        // Adjust active song index
        if (currentIndex === draggedIndex) {
          currentIndex = idx;
        } else if (draggedIndex < currentIndex && idx >= currentIndex) {
          currentIndex--;
        } else if (draggedIndex > currentIndex && idx <= currentIndex) {
          currentIndex++;
        }

        renderPlaylist();
      });

      playlistEl.appendChild(li);
    });
  }

  function updatePlayerUI() {
    if (currentIndex >= 0 && currentIndex < songs.length) {
      const song = songs[currentIndex];
      trackNameEl.textContent = song.title || stripExtension(song.name);
      trackSubEl.textContent = song.album
        ? `${song.artist || 'Unknown artist'} — ${song.album}`
        : (song.artist || 'Unknown artist');

      const url = pictureURLFor(song);
      if (url) {
        coverImgEl.src = url;
        coverImgEl.hidden = false;
        coverImgEl.removeAttribute('hidden');

        albumFallbackEl.hidden = true;
        albumFallbackEl.setAttribute('hidden', '');

        albumArtEl.classList.remove('has-fallback');
        artBackdropEl.style.backgroundImage = `url("${url}")`;
      } else {
        coverImgEl.hidden = true;
        coverImgEl.setAttribute('hidden', '');
        coverImgEl.removeAttribute('src');

        albumFallbackEl.hidden = false;
        albumFallbackEl.removeAttribute('hidden');

        albumArtEl.classList.add('has-fallback');
        artBackdropEl.style.backgroundImage = 'none';
      }
    } else {
      trackNameEl.textContent = 'Nothing playing';
      trackSubEl.textContent = 'Add some music to get started';

      coverImgEl.hidden = true;
      coverImgEl.setAttribute('hidden', '');
      coverImgEl.removeAttribute('src');

      albumFallbackEl.hidden = false;
      albumFallbackEl.removeAttribute('hidden');

      albumArtEl.classList.add('has-fallback');
      artBackdropEl.style.backgroundImage = 'none';
    }

    playIcon.classList.toggle('icon-hidden', isPlaying);
    pauseIcon.classList.toggle('icon-hidden', !isPlaying);
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');

    document.querySelectorAll('.playlist-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === currentIndex);
    });
  }

  function setSliderFill(el) {
    const max = parseFloat(el.max) || 0;
    const val = parseFloat(el.value) || 0;
    const pct = max > 0 ? (val / max) * 100 : 0;
    el.style.setProperty('--fill', pct + '%');
  }

  // ---------- Audio control ----------
  function playSong(index) {
    if (index < 0 || index >= songs.length) return;
    const song = songs[index];
    audio.pause();
    audio.src = audioURLFor(song);
    audio.load();
    currentIndex = index;
    isPlaying = true;
    audio.play().catch(() => {});
    updatePlayerUI();
    renderPlaylist();
    audio.addEventListener(
      'loadedmetadata',
      () => {
        durationEl.textContent = formatTime(audio.duration);
        progressSlider.max = audio.duration;
        setSliderFill(progressSlider);
      },
      { once: true }
    );
  }

  function togglePlay() {
    if (currentIndex === -1 && songs.length > 0) {
      playSong(0);
      return;
    }
    if (audio.paused) {
      audio.play().then(() => {
        isPlaying = true;
        updatePlayerUI();
      }).catch(() => {});
    } else {
      audio.pause();
      isPlaying = false;
      updatePlayerUI();
    }
  }

  function nextSong() {
    if (songs.length === 0) return;
    const next = (currentIndex + 1) % songs.length;
    playSong(next);
  }

  function prevSong() {
    if (songs.length === 0) return;
    const prev = (currentIndex - 1 + songs.length) % songs.length;
    playSong(prev);
  }

  function removeSong(index) {
    if (index < 0 || index >= songs.length) return;
    const song = songs[index];
    if (song.blobURL) URL.revokeObjectURL(song.blobURL);
    if (song.pictureURL) URL.revokeObjectURL(song.pictureURL);
    deleteSong(db, song.id).then(() => {
      songs.splice(index, 1);
      if (currentIndex === index) {
        audio.pause();
        audio.src = '';
        currentIndex = -1;
        isPlaying = false;
      } else if (currentIndex > index) {
        currentIndex--;
      }
      renderPlaylist();
      updatePlayerUI();
    }).catch(console.error);
  }

  // ---------- Helpers ----------
  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function setQueueOpen(open) {
    queuePanel.classList.toggle('open', open);
    queueBackdrop.classList.toggle('open', open);
    queueToggle.setAttribute('aria-pressed', String(open));
    queueToggle.setAttribute('aria-label', open ? 'Hide playlist' : 'Show playlist');
  }

  // ---------- Add music modal ----------
  function switchModalTab(tabName) {
    const isFile = tabName === 'file';
    tabFileBtn.classList.toggle('active', isFile);
    tabYoutubeBtn.classList.toggle('active', !isFile);
    tabFileBtn.setAttribute('aria-selected', String(isFile));
    tabYoutubeBtn.setAttribute('aria-selected', String(!isFile));
    paneFile.hidden = !isFile;
    paneYoutube.hidden = isFile;
  }

  function setModalOpen(open) {
    addModalBackdrop.hidden = !open;
    if (open) {
      switchModalTab('file');
      youtubeNote.hidden = true;
      youtubeUrlInput.value = '';
      youtubeUserInput.value = '';
      youtubePassInput.value = '';
      updateUIForAuth();
    }
  }

  async function importFromYoutube({ url, username, password }) {
    try {
      youtubeNote.hidden = false;
      youtubeNote.textContent = 'Downloading and converting, please wait…';
      youtubeSubmitBtn.disabled = true;

      const res = await fetch('/api/import-youtube', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, username, password })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Get the blob and extract filename from Content-Disposition
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = 'audio.mp3';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/);
        if (match) filename = decodeURIComponent(match[1]);
      }

      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'audio/mpeg' });

      // Process file like a local upload
      await processUploadedFile(file);

      youtubeNote.textContent = '✅ Successfully added!';
      youtubeNote.hidden = false;
      youtubeSubmitBtn.disabled = false;

      // Clear fields
      youtubeUrlInput.value = '';
      youtubeUserInput.value = '';
      youtubePassInput.value = '';

    } catch (err) {
      youtubeNote.textContent = '❌ ' + (err.message || 'Import failed');
      youtubeNote.hidden = false;
      youtubeSubmitBtn.disabled = false;
    }
  }

  // Refactor file upload handling into a reusable function
  async function processUploadedFile(file) {
    try {
      const [tags, arrayBuffer] = await Promise.all([readTags(file), file.arrayBuffer()]);
      const record = {
        name: file.name,
        data: arrayBuffer,
        title: tags.title || null,
        artist: tags.artist || null,
        album: tags.album || null,
        pictureBuffer: tags.picture ? tags.picture.buffer : null,
        pictureFormat: tags.picture ? tags.picture.format : null,
      };
      const id = await addSong(db, record);
      const newSong = Object.assign({ id }, record, { duration: 0 });
      songs.push(newSong);
      renderPlaylist();
      updatePlayerUI();

      readDuration(audioURLFor(newSong)).then((dur) => {
        newSong.duration = dur;
        renderPlaylist();
      });
    } catch (err) {
      console.error('Failed to store song:', err);
      throw err;
    }
  }

  // ---------------- Auth ---------------

  async function fetchWithAuth(url, options = {}) {
    options.credentials = 'include';
    options.headers = options.headers || {};
    if (options.body && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    return res;
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.username;
        isAdmin = data.is_admin;
        updateUIForAuth();
        return true;
      }
    } catch (e) {
      // ignore
    }
    currentUser = null;
    isAdmin = false;
    updateUIForAuth();
    return false;
  }

  function updateUIForAuth() {
    if (currentUser) {
      loginBtn.hidden = true;
      logoutBtn.hidden = false;
      userDisplay.hidden = false;
      userDisplay.textContent = currentUser;
      adminBtn.hidden = !isAdmin;
      // YouTube tab
      youtubeLoginRequired.hidden = true;
      youtubeContent.hidden = false;
    } else {
      loginBtn.hidden = false;
      logoutBtn.hidden = true;
      userDisplay.hidden = true;
      adminBtn.hidden = true;
      youtubeLoginRequired.hidden = false;
      youtubeContent.hidden = true;
    }
  }

  // ---------- Event listeners ----------
  uploadBtn.addEventListener('click', () => setModalOpen(true));
  modalCloseBtn.addEventListener('click', () => setModalOpen(false));
  addModalBackdrop.addEventListener('click', (e) => {
    if (e.target === addModalBackdrop) setModalOpen(false);
  });
  tabFileBtn.addEventListener('click', () => switchModalTab('file'));
  tabYoutubeBtn.addEventListener('click', () => switchModalTab('youtube'));
  chooseFileBtn.addEventListener('click', () => fileInput.click());

  youtubeSubmitBtn.addEventListener('click', () => {
    const url = youtubeUrlInput.value.trim();
    if (!url) {
      youtubeNote.hidden = false;
      youtubeNote.textContent = 'Enter a YouTube URL first.';
      return;
    }
    importFromYoutube({
      url,
      username: youtubeUserInput.value,
      password: youtubePassInput.value,
    });
  });

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    fileInput.value = '';
    setModalOpen(false);

    for (const file of files) {
      try {
        await processUploadedFile(file);
      } catch (err) {
        console.error('Failed to store song:', err);
      }
    }
  });

  playBtn.addEventListener('click', togglePlay);
  nextBtn.addEventListener('click', nextSong);
  prevBtn.addEventListener('click', prevSong);

  queueToggle.addEventListener('click', () => {
    setQueueOpen(!queuePanel.classList.contains('open'));
  });
  queueBackdrop.addEventListener('click', () => setQueueOpen(false));

  progressSlider.addEventListener('input', (e) => {
    isDragging = true;
    const val = parseFloat(e.target.value);
    audio.currentTime = val;
    currentTimeEl.textContent = formatTime(val);
    setSliderFill(progressSlider);
  });
  progressSlider.addEventListener('change', () => {
    isDragging = false;
  });

  volumeSlider.addEventListener('input', (e) => {
    audio.volume = parseFloat(e.target.value) / 100;
    setSliderFill(volumeSlider);
  });

  audio.addEventListener('timeupdate', () => {
    if (!isDragging && audio.duration) {
      progressSlider.value = audio.currentTime;
      currentTimeEl.textContent = formatTime(audio.currentTime);
      setSliderFill(progressSlider);
    }
  });

  audio.addEventListener('ended', () => {
    isPlaying = false;
    updatePlayerUI();
    nextSong();
  });

  audio.addEventListener('play', () => {
    isPlaying = true;
    updatePlayerUI();
  });
  audio.addEventListener('pause', () => {
    isPlaying = false;
    updatePlayerUI();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (!addModalBackdrop.hidden) {
        setModalOpen(false);
      } else {
        setQueueOpen(false);
      }
      return;
    }
    if (e.target.tagName === 'INPUT') return;
    if (!addModalBackdrop.hidden) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      nextSong();
    } else if (e.code === 'ArrowLeft') {
      prevSong();
    }
  });

  loginBtn.addEventListener('click', () => {
  loginModalBackdrop.hidden = false;
  loginError.hidden = true;
  loginUsername.value = '';
  loginPassword.value = '';
  });

  loginModalClose.addEventListener('click', () => loginModalBackdrop.hidden = true);
  loginModalBackdrop.addEventListener('click', (e) => {
    if (e.target === loginModalBackdrop) loginModalBackdrop.hidden = true;
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.value, password: loginPassword.value })
      });
      if (!res.ok) {
        const err = await res.json();
        loginError.textContent = err.error || 'Login failed';
        loginError.hidden = false;
        return;
      }
      const data = await res.json();
      currentUser = data.user.username;
      isAdmin = data.user.is_admin;
      updateUIForAuth();
      loginModalBackdrop.hidden = true;
    } catch (err) {
      loginError.textContent = err.message || 'Network error';
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    currentUser = null;
    isAdmin = false;
    updateUIForAuth();
  });

  adminBtn.addEventListener('click', async () => {
    if (!isAdmin) return;
    adminModalBackdrop.hidden = false;
    adminError.hidden = true;
    await refreshUserList();
  });

  adminModalClose.addEventListener('click', () => adminModalBackdrop.hidden = true);
  adminModalBackdrop.addEventListener('click', (e) => {
    if (e.target === adminModalBackdrop) adminModalBackdrop.hidden = true;
  });

  async function refreshUserList() {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      const users = await res.json();
      userList.innerHTML = users.map(u =>
        `<li><span>${u.username}</span> ${u.is_admin ? '⭐' : ''}</li>`
      ).join('');
    } catch (err) {
      adminError.textContent = err.message;
      adminError.hidden = false;
    }
  }

  addUserBtn.addEventListener('click', async () => {
    const username = newUsername.value.trim();
    const password = newPassword.value.trim();
    if (!username || !password) {
      adminError.textContent = 'Username and password required';
      adminError.hidden = false;
      return;
    }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, is_admin: newIsAdmin.checked })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add user');
      }
      newUsername.value = '';
      newPassword.value = '';
      newIsAdmin.checked = false;
      adminError.hidden = true;
      await refreshUserList();
    } catch (err) {
      adminError.textContent = err.message;
      adminError.hidden = false;
    }
  });

  youtubeLoginPrompt.addEventListener('click', () => {
    loginBtn.click();
  });

  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.toggle-password-btn');
    if (!toggleBtn) return;

    const wrapper = toggleBtn.closest('.input-wrapper');
    const input = wrapper.querySelector('input');
    const eyeClosed = toggleBtn.querySelector('.eye-closed');
    const eyeOpen = toggleBtn.querySelector('.eye-open');

    if (input.type === 'password') {
      input.type = 'text';
      eyeClosed.style.display = 'none';
      eyeOpen.style.display = 'block';
    } else {
      input.type = 'password';
      eyeClosed.style.display = 'block';
      eyeOpen.style.display = 'none';
    }
  });

  // ---------- Init ----------
  async function init() {
    initTheme();
    try {
      db = await openDB();
      const stored = await getAllSongs(db);
      songs = stored.map((item) => ({
        id: item.id,
        name: item.name,
        data: item.data,
        title: item.title || null,
        artist: item.artist || null,
        album: item.album || null,
        pictureBuffer: item.pictureBuffer || null,
        pictureFormat: item.pictureFormat || null,
        duration: 0,
      }));
      audio.volume = parseFloat(volumeSlider.value) / 100;
      setSliderFill(volumeSlider);
      setSliderFill(progressSlider);
      renderPlaylist();
      updatePlayerUI();

      // Lazily measure durations for tracks restored from IndexedDB.
      songs.forEach((song) => {
        readDuration(audioURLFor(song)).then((dur) => {
          song.duration = dur;
          renderPlaylist();
        });
      });

      // Open the queue by default when there's already a playlist to show.
      if (songs.length > 0 && window.matchMedia('(min-width: 720px)').matches) {
        setQueueOpen(true);
      }
    } catch (err) {
      console.error('Init error:', err);
    }
  }

  init();
  checkAuth();
})();

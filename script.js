document.addEventListener('DOMContentLoaded', () => {
  const mainNav = document.getElementById('mainNav');
  const contentArea = document.getElementById('contentArea');
  const outlineSidebar = document.getElementById('outlineSidebar');
  const outlineList = document.getElementById('outlineList');
  const searchInput = document.getElementById('searchInput');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const sidebar = document.getElementById('sidebar');
  const leftSwipeIndicator = document.getElementById('leftSwipeIndicator');
  const rightSwipeIndicator = document.getElementById('rightSwipeIndicator');

  let allContentData = {};
  let folderStructure = [];
  let openFolders = {};
  let activeAudio = null;
  let activeIntervals = [];
  let currentView = null; // For view filtering

  // Touch swipe variables
  let touchStartX = 0;
  let touchEndX = 0;
  const swipeThreshold = 80; // Minimum distance for a swipe (increased for less sensitivity)

  // Marked config (GFM with soft line breaks)
  marked.setOptions({
    gfm: true,
    breaks: true,
    mangle: false,
    headerIds: false
  });

  // Utilities
  async function fetchJson(path) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
      return await response.json();
    } catch (error) {
      console.error('Could not fetch ' + path + ':', error);
      return null;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function sanitizeId(text) {
    return text.toLowerCase().trim()
      .replace(/["']/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');
  }

  function fileIdFromFilename(filename) {
    return filename.replace(/\.json$/i, '');
  }

  // View filtering system
  function shouldShowItem(item) {
    if (!currentView) return true;
    if (typeof item === 'string') {
      const fileId = fileIdFromFilename(item);
      const itemData = allContentData[fileId];
      return itemData && itemData.views && itemData.views.includes(currentView);
    } else if (item && item.type === 'folder') {
      return item.views ? item.views.includes(currentView) : hasVisibleChildren(item);
    }
    return true;
  }

  function hasVisibleChildren(folder) {
    if (!folder.children) return false;
    return folder.children.some(child => shouldShowItem(child));
  }

  function createSidebarItem(fileId) {
    const itemData = allContentData[fileId];
    if (!itemData || !shouldShowItem(fileId + '.json')) return null;

    const itemElement = document.createElement('a');
    itemElement.classList.add('sidebar-item', 'file-item');
    itemElement.href = `#${fileId}`;
    itemElement.dataset.id = fileId;

    const icon = document.createElement('i');
    icon.classList.add('fas', 'fa-file-lines', 'item-icon');
    itemElement.appendChild(icon);

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('item-title');
    titleSpan.textContent = itemData.sidebarTitle || fileId;
    itemElement.appendChild(titleSpan);

    return itemElement;
  }

  function createFolderItem(folderData) {
    if (!shouldShowItem(folderData)) return null;

    const folderId = sanitizeId(folderData.title);
    const folderWrapper = document.createElement('div');
    folderWrapper.classList.add('folder-wrapper');

    const folderElement = document.createElement('div');
    folderElement.classList.add('sidebar-item', 'folder');
    folderElement.dataset.id = folderId;

    const icon = document.createElement('i');
    icon.classList.add('fas', 'item-icon', 'fa-folder');
    folderElement.appendChild(icon);

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('item-title');
    titleSpan.textContent = folderData.title;
    folderElement.appendChild(titleSpan);

    folderElement.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFolder(folderId, folderElement);
    });

    folderWrapper.appendChild(folderElement);
    return folderWrapper;
  }

  function renderSidebar(structure, allData, parentElement, level = 0, searchTerm = '') {
    structure.forEach(item => {
      if (typeof item === 'string') {
        const fileId = fileIdFromFilename(item);
        const itemData = allData[fileId];
        if (itemData && shouldShowItem(item) && (!searchTerm || (itemData.sidebarTitle || '').toLowerCase().includes(searchTerm))) {
          const sidebarItem = createSidebarItem(fileId);
          if (sidebarItem) parentElement.appendChild(sidebarItem);
        }
      } else if (item && item.type === 'folder' && shouldShowItem(item)) {
        const folderWrapper = createFolderItem(item);
        if (!folderWrapper) return;
        
        folderWrapper.classList.toggle('level-odd', level % 2 !== 0);
        const folderContentElement = document.createElement('div');
        folderContentElement.classList.add('folder-content');

        renderSidebar(item.children || [], allData, folderContentElement, level + 1, searchTerm);

        if (folderContentElement.hasChildNodes() || (searchTerm && (item.title || '').toLowerCase().includes(searchTerm))) {
          folderWrapper.appendChild(folderContentElement);
          parentElement.appendChild(folderWrapper);

          const folderElement = folderWrapper.querySelector('.folder');
          const folderId = sanitizeId(item.title);
          const shouldBeOpen = openFolders[folderId] || (searchTerm && folderContentElement.hasChildNodes());

          if (shouldBeOpen) {
            folderContentElement.classList.add('expanded');
            folderElement.querySelector('.item-icon').classList.replace('fa-folder', 'fa-folder-open');
          }
        }
      }
    });
  }

  function toggleFolder(folderId, folderElement) {
    openFolders[folderId] = !openFolders[folderId];
    const isOpen = openFolders[folderId];

    const icon = folderElement.querySelector('.item-icon');
    const folderContent = folderElement.parentElement.querySelector('.folder-content');

    if (folderContent) {
      folderContent.classList.toggle('expanded', isOpen);
      icon.classList.toggle('fa-folder-open', isOpen);
      icon.classList.toggle('fa-folder', !isOpen);
    }
  }

  // Shield code so shortcodes don't process inside normal Markdown code
  function shieldCode(text) {
    const blocks = [];
    const inlines = [];
    // Triple-fenced code blocks
    text = text.replace(/```([\s\S]*?)```/g, (m) => {
      const i = blocks.length;
      blocks.push(m);
      return `%%CODEBLOCK_${i}%%`;
    });
    // Inline code (single backticks)
    text = text.replace(/`([^`]+)`/g, (m) => {
      const i = inlines.length;
      inlines.push(m);
      return `%%INLINECODE_${i}%%`;
    });
    return { text, blocks, inlines };
  }

  function unshieldCode(text, blocks, inlines) {
    text = text.replace(/%%INLINECODE_(\d+)%%/g, (_, i) => inlines[+i]);
    text = text.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => blocks[+i]);
    return text;
  }

  function parseCustomMarkdown(rawText) {
    let preProcessed = rawText;

    // 1) Handle [CODEBLOCK title="..."] ... [/CODEBLOCK] FIRST (it may contain fenced code)
    preProcessed = preProcessed.replace(/\[CODEBLOCK\s+title="([^"]+)"\]([\s\S]*?)\[\/CODEBLOCK\]/gim, (match, title, inner) => {
      // Try to extract language and code from a single fenced block inside
      const fenceMatch = inner.match(/```(\w+)?\s*([\s\S]*?)\s*```/);
      const language = fenceMatch && fenceMatch[1] ? fenceMatch[1] : '';
      const code = fenceMatch ? fenceMatch[2] : inner.trim();
      const safeTitle = (title || 'file.txt').replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
      const escapedCode = escapeHtml(code);

      return `
<div class="code-container">
  <div class="code-header">
    <span class="code-title"><i class="fas fa-file-alt"></i> ${title}</span>
    <div class="code-buttons">
      <button class="copy-code-btn" title="Copy code"><i class="fas fa-copy"></i></button>
      <button class="download-code-btn" title="Download file" data-filename="${safeTitle}"><i class="fas fa-download"></i></button>
    </div>
  </div>
  <pre class="language-${language}"><code class="language-${language}">${escapedCode}</code></pre>
</div>`;
    });

    // 2) Handle [CONTAINER]...[/CONTAINER] before shielding code
    preProcessed = preProcessed.replace(/\[CONTAINER\]([\s\S]*?)\[\/CONTAINER\]/gim, (match, content) => {
      return `\n<div class="container">${content}</div>\n`;
    });

    // 3) Shield normal Markdown code (so other shortcodes don't break code examples)
    const { text: shieldedText, blocks, inlines } = shieldCode(preProcessed);
    preProcessed = shieldedText;

    // 4) Other Block shortcodes (non-code content)
    const blockReplacements = {
      'INFO': (content) =>
        `\n<div class="info-box"><i class="fas fa-info-circle"></i><div>${content}</div></div>\n`,
      'WARNING': (content) =>
        `\n<div class="warning-box"><i class="fas fa-exclamation-triangle"></i><div>${content}</div></div>\n`,
      'COPY': (content) => {
        const escaped = escapeHtml(content);
        return `\n<div class="copy-container"><pre><code>${escaped}</code></pre><button class="copy-button" title="Copy"><i class="fas fa-copy"></i></button></div>\n`;
      },
      'FILETREE': (content) => `\n<div class="file-tree-data-wrapper">${content}</div>\n`,
      'COLUMNS': (content) => `\n<div class="columns-container">${content}</div>\n`,
      'COLUMN': (content) => `\n<div class="column">${content}</div>\n`,
      'TABS': (content) => `\n<div class="tabs-container">${content}</div>\n`,
      'TIMELINE': (content) => `\n<div class="timeline">${content}</div>\n`,
      'GALLERY': (content) => `\n<div class="image-gallery">${content}</div>\n`,
      'CAROUSEL': (content) => `\n<div class="carousel-wrapper">${content}</div>\n`,
      'SLIDE': (content) => `\n<div class="carousel-slide">${content}</div>\n`
    };

    for (const tag in blockReplacements) {
      const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'gim');
      preProcessed = preProcessed.replace(regex, (_, content) => blockReplacements[tag](content));
    }

    // GRID
    preProcessed = preProcessed.replace(/\[GRID\s*(?:cols="([^"]+)")?\]([\s\S]*?)\[\/GRID\]/gi, (match, cols, content) => {
      let style = '';
      if (cols) {
        if (!isNaN(cols)) {
          style = `style="grid-template-columns: repeat(${cols}, 1fr);"`;
        } else {
          style = `style="grid-template-columns: ${cols};"`;
        }
      }
      const cellContent = content.replace(/\[CELL\]([\s\S]*?)\[\/CELL\]/gi, '<div class="grid-cell">$1</div>');
      return `\n<div class="grid-container" ${style}>${cellContent}</div>\n`;
    });

    // DETAILS
    preProcessed = preProcessed.replace(/\[DETAILS\s+title="([^"]+)"(\s+open)?\]([\s\S]*?)\[\/DETAILS\]/gim, (match, title, openAttr, content) => {
      const open = openAttr ? ' open' : '';
      return `\n<details class="custom-details"${open}><summary>${title}</summary><div class="details-content">${content}</div></details>\n`;
    });

    // VIDEO (supports YouTube regular + shorts, else HTML5 video)
    preProcessed = preProcessed.replace(/\[VIDEO\s+src="([^"]+)"\]\s*\[\/VIDEO\]/gi, (match, src) => {
      const yt = src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
      if (yt) {
        const id = yt[1];
        return `\n<div class="video-container"><iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>\n`;
      }
      return `\n<div class="video-container"><video controls src="${src}" class="embedded-video"></video></div>\n`;
    });

    // AUDIO
    preProcessed = preProcessed.replace(/\[AUDIO\s+src="([^"]+)"\s+title="([^"]+)"\]\s*\[\/AUDIO\]/gi, (match, src, title) => {
      return `\n<div class="audio-player-wrapper">
  <div class="audio-player-title">${title}</div>
  <div class="audio-player">
    <audio class="audio-element" src="${src}" preload="metadata"></audio>
    <button class="play-pause-btn"><i class="fas fa-play"></i></button>
    <div class="time-container">
      <span class="current-time">0:00</span> / <span class="total-time">0:00</span>
    </div>
    <div class="progress-bar-container">
      <input type="range" class="progress-bar" value="0" min="0" max="100" step="0.1">
    </div>
    <div class="controls-container">
      <div class="volume-container">
        <button class="volume-btn"><i class="fas fa-volume-high"></i></button>
        <div class="volume-slider-container"><input type="range" class="volume-slider" value="1" min="0" max="1" step="0.01"></div>
      </div>
      <div class="speed-container">
        <button class="speed-btn">1x</button>
        <div class="speed-options">
          <button data-speed="0.5">0.5x</button><button data-speed="1">1x</button><button data-speed="1.2">1.2x</button><button data-speed="1.5">1.5x</button><button data-speed="2">2x</button>
        </div>
      </div>
    </div>
  </div>
</div>\n`;
    });

    // TABS/TAB
    preProcessed = preProcessed.replace(/\[TAB\s+name="([^"]+)"\]([\s\S]*?)\[\/TAB\]/gim, '\n<div class="tab-panel-item" data-name="$1">$2</div>\n');

    // TIMELINE/EVENT
    preProcessed = preProcessed.replace(/\[EVENT\s+date="([^"]+)"(\s+open)?\]([\s\S]*?)\[\/EVENT\]/gim, (match, date, openAttr, content) => {
      const activeClass = openAttr ? ' active' : '';
      return `\n<div class="timeline-event${activeClass}"><div class="timeline-date">${date} <i class="fas fa-chevron-right timeline-arrow"></i></div><div class="timeline-content">${content}</div></div>\n`;
    });

    // MAP
    preProcessed = preProcessed.replace(/\[MAP\s+src="([^"]+)"\]\s*\[\/MAP\]/gi, `\n<div class="map-container"><iframe src="$1" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>\n`);

    // COUNTDOWN
    preProcessed = preProcessed.replace(/\[COUNTDOWN\s+date="([^"]+)"\]\s*\[\/COUNTDOWN\]/gi, `\n<div class="countdown" data-date="$1"></div>\n`);

    // ANIMATE (stagger each char with --i)
    preProcessed = preProcessed.replace(/\[ANIMATE\s+type="([^"]+)"\]([\s\S]*?)\[\/ANIMATE\]/gi, (match, type, text) => {
      const letters = Array.from(text).map((ch, idx) => {
        const char = ch === ' ' ? '&nbsp;' : escapeHtml(ch);
        return `<span style="--i:${idx}">${char}</span>`;
      }).join('');
      return `<span class="animate-text animate-${type}">${letters}</span>`;
    });

    // LINK
    preProcessed = preProcessed.replace(/\[LINK\s+url="([^"]+)"\]([\s\S]*?)\[\/LINK\]/gi, `<a href="$1" class="link-button" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i><span>$2</span></a>`);

    // GRADIENT
    preProcessed = preProcessed.replace(/\[GRADIENT\s*(?:from="([^"]+)"\s*to="([^"]+)")?\](.*?)\[\/GRADIENT\]/gi, (match, from, to, text) => {
      if (from && to) return `<span class="gradient-text" style="background-image: linear-gradient(45deg, ${from}, ${to});">${text}</span>`;
      return `<span class="gradient-text">${text}</span>`;
    });

    // HR
    preProcessed = preProcessed.replace(/\[HR\]/gi, `\n<hr class="styled-divider">\n`);

    // 4) Inline tokens
    preProcessed = preProcessed.replace(/\(fa\)([\w-]+)\(\/fa\)/g, `<i class="fas fa-$1"></i>`);
    preProcessed = preProcessed.replace(/\(color=([#\w]+)\)(.*?)\(\/color\)/g, `<span style="color: $1">$2</span>`);

    // Highlight: support both (highlight=color) and (highlight-color)
    preProcessed = preProcessed.replace(/\(highlight=([\w-]+)\)(.*?)\(\/highlight\)/g, `<mark class="highlight-$1">$2</mark>`);
    preProcessed = preProcessed.replace(/\(highlight-([\w-]+)\)(.*?)\(\/highlight\)/g, `<mark class="highlight-$1">$2</mark>`);

    preProcessed = preProcessed.replace(/\(KBD\)(.*?)\(\/KBD\)/g, `<kbd>$1</kbd>`);
    preProcessed = preProcessed.replace(/\(FILE\)(.*?)\(\/FILE\)/g, `<a href="$1" class="file-link" download><i class="fas fa-download"></i><span>$1</span></a>`);
    preProcessed = preProcessed.replace(/!\[(.*?)\]\((.*?)\)\{\.(big|medium|small)\}/g, `<img src="$2" alt="$1" class="img-$3">`);

    // 5) Unshield code and let marked handle standard Markdown
    preProcessed = unshieldCode(preProcessed, blocks, inlines);
    let finalHtml = marked.parse(preProcessed);

    // 6) DOM post-processing
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = finalHtml;

    // Clean p-wrappers in components
    tempDiv.querySelectorAll('.info-box > div, .warning-box > div, .timeline-content, .column, .tab-panel-item, .details-content, .grid-cell, .carousel-slide').forEach(el => {
      while (el.children.length === 1 && el.firstElementChild.tagName === 'P') {
        el.innerHTML = el.firstElementChild.innerHTML;
      }
    });

    // TABS assembly
    tempDiv.querySelectorAll('.tabs-container').forEach(container => {
      const panels = Array.from(container.querySelectorAll('.tab-panel-item'));
      if (panels.length === 0) return;
      const tabButtons = document.createElement('div');
      tabButtons.className = 'tab-buttons';
      const tabPanels = document.createElement('div');
      tabPanels.className = 'tab-panels';
      panels.forEach((panel, index) => {
        let name = panel.dataset.name;
        // If name is not provided or is empty, use a default name
        if (!name) {
          name = `Tab ${index + 1}`;
        } else {
          // Process icons in the name
          name = name.replace(/\(fa\)([\w-]+)\(\/fa\)/g, `<i class="fas fa-$1"></i>`);
        }

        const button = document.createElement('button');
        button.className = 'tab-button';
        button.dataset.tab = index;
        button.innerHTML = name;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'tab-content';
        contentDiv.dataset.tabContent = index;
        contentDiv.innerHTML = panel.innerHTML;

        if (index === 0) {
          button.classList.add('active');
          contentDiv.classList.add('active');
        }
        tabButtons.appendChild(button);
        tabPanels.appendChild(contentDiv);
        panel.remove();
      });
      container.innerHTML = '';
      container.appendChild(tabButtons);
      container.appendChild(tabPanels);
    });

    // FILETREE text -> structure
    tempDiv.querySelectorAll('.file-tree-data-wrapper').forEach(wrapper => {
      const lines = wrapper.textContent.replace(/\r\n/g, '\n').trim().split('\n');
      let html = '<div class="file-tree">';
      let level = 0;
      lines.forEach(line => {
        const indent = line.match(/^\s*/)[0].length;
        const currentLevel = Math.floor(indent / 2);
        const isFolder = line.trim().startsWith('+');
        const text = line.trim().slice(isFolder ? 1 : 0).trim();

        if (currentLevel < level) {
          html += '</div>'.repeat((level - currentLevel));
        }
        html += `<div class="sidebar-item ${isFolder ? 'folder' : 'file-item'}"><i class="fas ${isFolder ? 'fa-folder' : 'fa-file-lines'} item-icon"></i><span class="item-title">${escapeHtml(text)}</span></div>`;
        if (isFolder) {
          html += `<div class="folder-content expanded">`;
          level = currentLevel + 1;
        } else {
          level = currentLevel;
        }
      });
      html += '</div>'.repeat(level) + '</div>';

      const treeContainer = document.createElement('div');
      treeContainer.innerHTML = html;
      wrapper.replaceWith(treeContainer.firstChild);
    });

    // Copyable blockquote (first line exactly "copyable")
    tempDiv.querySelectorAll('blockquote').forEach(bq => {
      const firstP = bq.querySelector('p');
      if (firstP && firstP.textContent.trim() === 'copyable') {
        firstP.remove();
        const copyContainer = document.createElement('div');
        copyContainer.className = 'copy-container';
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.title = 'Copy';
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        bq.before(copyContainer);
        copyContainer.appendChild(bq);
        copyContainer.appendChild(copyButton);
      }
    });

    // External links open in new tab (keep hash/relative links as-is)
    tempDiv.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (/^https?:\/\//i.test(href)) {
        if (!a.hasAttribute('target')) a.setAttribute('target', '_blank');
        if (!a.hasAttribute('rel')) a.setAttribute('rel', 'noopener noreferrer');
      }
    });

    // Gallery: unwrap single <p><img/></p> to just <img>
    tempDiv.querySelectorAll('.image-gallery p > img').forEach(img => {
      const p = img.parentElement;
      if (p.childNodes.length === 1) p.replaceWith(img);
    });

    return tempDiv.innerHTML;
  }

  async function loadContent(id) {
    if (activeAudio) { activeAudio.pause(); activeAudio = null; }
    activeIntervals.forEach(clearInterval);
    activeIntervals = [];

    contentArea.scrollTop = 0;
    contentArea.innerHTML = '<div class="loading">Loading content...</div>';
    outlineList.innerHTML = '';
    outlineSidebar.style.display = 'none';
    const contentData = allContentData[id];

    if (!contentData) {
      contentArea.innerHTML = `<div class="loading">Content for "${id}" not found. Check filename.</div>`;
      return;
    }

    const parsedContent = parseCustomMarkdown(contentData.content);

    contentArea.innerHTML = `
      <div class="markdown-content-container">
        <h1 class="title">${contentData.fullTitle}</h1>
        <p class="last-edited">Last edited: ${contentData.lastEdited}</p>
        <div class="markdown-content">${parsedContent}</div>
      </div>`;

    Prism.highlightAllUnder(contentArea);
    initializeCarousels();
    initializeCountdowns();

    // Image fallback placeholder
    contentArea.querySelectorAll('img').forEach(img => {
      img.onerror = () => {
        img.classList.add('placeholder');
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAP///yH5BAEAAAALAAAABAAEAAAIBRAA7';
      };
    });

    // Audio player wiring
    contentArea.querySelectorAll('.audio-player').forEach(player => {
      const audio = player.querySelector('.audio-element');
      const totalTimeEl = player.querySelector('.total-time');
      const progressBar = player.querySelector('.progress-bar');
      let isDragging = false;

      const setTimes = () => {
        if (isFinite(audio.duration)) {
          totalTimeEl.textContent = formatTime(audio.duration);
          progressBar.max = audio.duration;
        }
      };
      if (audio.readyState > 0) setTimes(); else audio.addEventListener('loadedmetadata', setTimes);

      progressBar.addEventListener('input', () => {
        if (!isDragging) isDragging = true;
        player.querySelector('.current-time').textContent = formatTime(progressBar.value);
        if (audio.duration) {
          progressBar.style.backgroundSize = `${(progressBar.value / audio.duration) * 100}% 100%`;
        }
      });
      progressBar.addEventListener('change', () => {
        isDragging = false;
        audio.currentTime = progressBar.value;
      });
      audio.addEventListener('timeupdate', () => {
        if (!isDragging && isFinite(audio.duration)) {
          player.querySelector('.current-time').textContent = formatTime(audio.currentTime);
          progressBar.value = audio.currentTime;
          progressBar.style.backgroundSize = `${(audio.currentTime / audio.duration) * 100}% 100%`;
        }
      });
    });

    // Open timeline events measure height
    contentArea.querySelectorAll('.timeline-event.active').forEach(eventElement => {
      const content = eventElement.querySelector('.timeline-content');
      if (content) content.style.maxHeight = content.scrollHeight + 'px';
    });

    // Details animated height
    contentArea.querySelectorAll('details.custom-details').forEach(details => {
      const content = details.querySelector('.details-content');
      if (content && details.open) content.style.maxHeight = content.scrollHeight + 'px';
      details.addEventListener('toggle', () => {
        if (!content) return;
        content.style.maxHeight = details.open ? content.scrollHeight + 'px' : null;
      });
    });

    generateOutline();
  }

  function generateOutline() {
    const headings = contentArea.querySelectorAll('.markdown-content h2, .markdown-content h3');
    outlineList.innerHTML = '';
    if (headings.length === 0) {
      outlineSidebar.style.display = 'none';
      document.body.classList.remove('outline-sidebar-open');
      updateSwipeIndicators();
      return;
    }
    outlineSidebar.style.display = 'block';
    document.body.classList.add('outline-sidebar-open'); // Indicate outline sidebar is open

    // Ensure unique IDs
    const seen = new Map();
    function uniqueId(base) {
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}-${count + 1}`;
    }

    headings.forEach((heading, index) => {
      let baseId = sanitizeId(heading.textContent || `section-${index}`);
      const id = uniqueId(baseId);
      heading.id = id;
      const listItem = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${id}`;
      link.textContent = heading.textContent;
      link.dataset.targetId = id;
      if (heading.tagName === 'H3') listItem.classList.add('indent-1');
      listItem.appendChild(link);
      outlineList.appendChild(listItem);
    });

    updateSwipeIndicators();
  }

  function updateSwipeIndicators() {
    const isMobile = window.innerWidth <= 1024;
    if (!isMobile) {
      leftSwipeIndicator.style.display = 'none';
      rightSwipeIndicator.style.display = 'none';
      return;
    }
    leftSwipeIndicator.style.display = 'flex';
    rightSwipeIndicator.style.display = outlineList.children.length > 0 ? 'flex' : 'none';
  }

  function updateActiveOutlineItem() {
    const scrollOffset = contentArea.getBoundingClientRect().top;
    const outlineLinks = outlineList.querySelectorAll('a');
    let activeLink = null;
    for (const link of outlineLinks) {
      const heading = document.getElementById(link.dataset.targetId);
      if (heading && heading.getBoundingClientRect().top - scrollOffset < 150) {
        activeLink = link;
      }
    }
    outlineLinks.forEach(link => link.classList.remove('active'));
    if (activeLink) {
      activeLink.classList.add('active');
    } else if (outlineLinks.length > 0) {
      outlineLinks[0].classList.add('active');
    }
  }

  function updateActiveSidebarItem() {
    const currentHash = window.location.hash.substring(1);
    document.querySelectorAll('.sidebar-item.active').forEach(item => item.classList.remove('active'));
    if (currentHash) {
      const activeLink = document.querySelector(`a.sidebar-item[href="#${currentHash}"]`);
      if (activeLink) activeLink.classList.add('active');
    }
  }

  async function handleHashChange() {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');

    // Only re-render sidebar if view parameter has changed
    if (viewParam !== currentView) {
      currentView = viewParam; // Update currentView
      mainNav.innerHTML = '';
      renderSidebar(folderStructure, allContentData, mainNav);
      updateActiveSidebarItem();
    }

    let id = window.location.hash.substring(1);

    // If no specific file is requested, try to load the first visible file
    if (!id) {
      const firstFile = getVisibleFileIds(folderStructure)[0];
      if (firstFile) {
        id = fileIdFromFilename(firstFile);
        window.location.hash = `#${id}`; // Update hash to reflect the loaded file
        return; // Exit to let the hashchange event re-trigger with the new hash
      } else {
        contentArea.innerHTML = '<div class="loading">No content available for this view.</div>';
        outlineSidebar.style.display = 'none';
        document.body.classList.remove('outline-sidebar-open');
        return;
      }
    }

    await loadContent(id);
    updateActiveSidebarItem();
    // Ensure scroll listener is only added once
    contentArea.removeEventListener('scroll', updateActiveOutlineItem);
    contentArea.addEventListener('scroll', updateActiveOutlineItem);
  }

  document.body.addEventListener('click', (e) => {
    if (!e.target.closest('.volume-container')) document.querySelectorAll('.volume-slider-container.visible').forEach(el => el.classList.remove('visible'));
    if (!e.target.closest('.speed-container')) document.querySelectorAll('.speed-options.visible').forEach(el => el.classList.remove('visible'));
  });

  contentArea.addEventListener('click', (e) => {
    const target = e.target;

    // Tabs
    if (target.matches('.tab-button')) {
      const button = target;
      const tabsContainer = button.closest('.tabs-container');
      const tabIndex = button.dataset.tab;
      tabsContainer.querySelectorAll('.tab-button, .tab-content').forEach(el => el.classList.remove('active'));
      button.classList.add('active');
      tabsContainer.querySelector(`.tab-content[data-tab-content="${tabIndex}"]`).classList.add('active');
    }

    // Timeline toggle
    if (target.closest('.timeline-date')) {
      const eventElement = target.closest('.timeline-event');
      eventElement.classList.toggle('active');
      const content = eventElement.querySelector('.timeline-content');
      content.style.maxHeight = eventElement.classList.contains('active') ? content.scrollHeight + 'px' : '0px';
    }

    // Copy buttons (COPY and CODEBLOCK)
    if (target.closest('.copy-button, .copy-code-btn')) {
      const button = target.closest('button');
      const container = button.closest('.copy-container, .code-container');
      const codeEl = container.querySelector('code, blockquote');
      const codeText = codeEl ? codeEl.innerText : '';
      navigator.clipboard.writeText(codeText).then(() => {
        button.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { button.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
      });
    }

    // Download code button
    if (target.closest('.download-code-btn')) {
      const button = target.closest('.download-code-btn');
      const code = button.closest('.code-container').querySelector('code').textContent;
      const filename = button.dataset.filename || 'download.txt';
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    // Audio player controls
    const player = target.closest('.audio-player');
    if (player) handleAudioPlayerEvents(e, player);
  });

  function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  function handleAudioPlayerEvents(e, player) {
    const audio = player.querySelector('.audio-element');
    const playPauseBtn = player.querySelector('.play-pause-btn i');
    const volumeBtnIcon = player.querySelector('.volume-btn i');
    const volumeSlider = player.querySelector('.volume-slider');

    function playPause() {
      if (audio.paused) {
        if (activeAudio && activeAudio !== audio) activeAudio.pause();
        audio.play();
        activeAudio = audio;
      } else {
        audio.pause();
      }
    }

    function updateVolume() {
      volumeSlider.style.backgroundSize = `${volumeSlider.value * 100}% 100%`;
      audio.volume = parseFloat(volumeSlider.value);
      volumeBtnIcon.className = 'fas ' + (audio.volume > 0.5 ? 'fa-volume-high' : audio.volume > 0 ? 'fa-volume-low' : 'fa-volume-xmark');
    }

    audio.addEventListener('play', () => { playPauseBtn.className = 'fas fa-pause'; });
    audio.addEventListener('pause', () => { playPauseBtn.className = 'fas fa-play'; });

    const target = e.target;
    if (target.closest('.play-pause-btn')) playPause();
    if (target.closest('.volume-btn')) {
      e.stopPropagation();
      player.querySelector('.volume-slider-container').classList.toggle('visible');
    }
    if (target.matches('.volume-slider')) updateVolume();
    if (target.closest('.speed-btn')) {
      e.stopPropagation();
      player.querySelector('.speed-options').classList.toggle('visible');
    }
    if (target.matches('.speed-options button')) {
      audio.playbackRate = parseFloat(target.dataset.speed || '1');
      player.querySelector('.speed-btn').textContent = `${audio.playbackRate}x`;
      player.querySelector('.speed-options').classList.remove('visible');
    }
  }

  function initializeCarousels() {
    contentArea.querySelectorAll('.carousel-wrapper').forEach(wrapper => {
      const slides = wrapper.querySelectorAll('.carousel-slide');
      if (slides.length <= 1) {
        const only = slides[0];
        if (only) wrapper.replaceWith(only);
        return;
      }
      let currentIndex = 0;

      const container = document.createElement('div');
      container.className = 'carousel-container';
      const slideContainer = document.createElement('div');
      slideContainer.className = 'carousel-slides';
      slides.forEach(slide => slideContainer.appendChild(slide));

      const prevBtn = document.createElement('button');
      prevBtn.className = 'carousel-btn prev';
      prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
      const nextBtn = document.createElement('button');
      nextBtn.className = 'carousel-btn next';
      nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
      const dotsContainer = document.createElement('div');
      dotsContainer.className = 'carousel-dots';

      slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'carousel-dot';
        dot.dataset.index = i;
        dotsContainer.appendChild(dot);
      });

      container.append(slideContainer, prevBtn, nextBtn, dotsContainer);
      wrapper.replaceWith(container);

      function showSlide(index) {
        slideContainer.style.transform = `translateX(-${index * 100}%)`;
        dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, i) => {
          dot.classList.toggle('active', i === index);
        });
        currentIndex = index;
      }

      prevBtn.addEventListener('click', () => showSlide((currentIndex - 1 + slides.length) % slides.length));
      nextBtn.addEventListener('click', () => showSlide((currentIndex + 1) % slides.length));
      dotsContainer.addEventListener('click', e => {
        if (e.target.matches('.carousel-dot')) showSlide(parseInt(e.target.dataset.index, 10));
      });

      showSlide(0);
    });
  }

  function initializeCountdowns() {
    contentArea.querySelectorAll('.countdown').forEach(el => {
      const targetDate = new Date(el.dataset.date).getTime();
      if (isNaN(targetDate)) {
        el.innerHTML = 'Invalid date format.';
        return;
      }

      const intervalId = setInterval(() => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
          clearInterval(intervalId);
          el.innerHTML = `<div class="countdown-expired">Countdown Expired</div>`;
          return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        el.innerHTML = `
          <div class="countdown-block"><span class="countdown-number">${days}</span><span class="countdown-label">Days</span></div>
          <div class="countdown-block"><span class="countdown-number">${hours}</span><span class="countdown-label">Hours</span></div>
          <div class="countdown-block"><span class="countdown-number">${minutes}</span><span class="countdown-label">Minutes</span></div>
          <div class="countdown-block"><span class="countdown-number">${seconds}</span><span class="countdown-label">Seconds</span></div>
        `;
      }, 1000);
      activeIntervals.push(intervalId);
    });
  }

  outlineSidebar.addEventListener('click', (e) => {
    if (e.target.matches('a[data-target-id]')) {
      e.preventDefault();
      const targetId = e.target.dataset.targetId;
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
        history.pushState(null, null, e.target.getAttribute('href'));
      }
    }
  });

  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    mainNav.innerHTML = '';
    renderSidebar(folderStructure, allContentData, mainNav, 0, searchTerm);
    updateActiveSidebarItem();
  });

  darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-theme'));
    const prismLink = document.querySelector('link[href*="prism"]');
    prismLink.href = document.body.classList.contains('dark-theme')
      ? 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.28.0/themes/prism-okaidia.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.28.0/themes/prism.min.css';
  });

  function getFileIds(structure) {
    let ids = [];
    for (const item of structure || []) {
      if (typeof item === 'string') ids.push(item);
      else if (item && item.children) ids = ids.concat(getFileIds(item.children));
    }
    return ids;
  }

  function getVisibleFileIds(structure) {
    let ids = [];
    for (const item of structure || []) {
      if (typeof item === 'string' && shouldShowItem(item)) {
        const fileId = fileIdFromFilename(item);
        if (allContentData[fileId]) { // Only add if content data exists
          ids.push(item);
        }
      } else if (item && item.children && shouldShowItem(item)) {
        ids = ids.concat(getVisibleFileIds(item.children));
      }
    }
    return ids;
  }

  async function initialize() {
    if (localStorage.getItem('darkMode') === 'false') document.body.classList.remove('dark-theme');
    
    // Check for view parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const requestedView = urlParams.get('view');

    folderStructure = await fetchJson('./folders.json');
    if (!folderStructure) {
      contentArea.innerHTML = '<div class="loading">Error loading folder structure.</div>';
      return;
    }
    if (!Array.isArray(folderStructure)) folderStructure = [folderStructure];

    // Fetch all content data first
    const fileIdsToFetch = getFileIds(folderStructure);
    const fetchPromises = fileIdsToFetch.map(filename => {
      const id = fileIdFromFilename(filename);
      return fetchJson(`./files/${filename}`).then(data => {
        if (data) allContentData[id] = { id, ...data };
      });
    });
    await Promise.all(fetchPromises);

    // Validate and set currentView
    const availableViews = new Set();
    (function collectViews(structure) {
      (structure || []).forEach(item => {
        if (typeof item === 'string') {
          const itemData = allContentData[fileIdFromFilename(item)];
          if (itemData && itemData.views) itemData.views.forEach(view => availableViews.add(view));
        } else if (item && item.type === 'folder' && item.views) {
          item.views.forEach(view => availableViews.add(view));
        }
        if (item && item.children) collectViews(item.children);
      });
    })(folderStructure);

    if (requestedView && availableViews.has(requestedView)) {
      currentView = requestedView;
    } else {
      currentView = null; // If view is invalid or not present, clear it to show all content
    }

    openFolders = {};
    (function findOpenFolders(structure) {
      (structure || []).forEach(item => {
        if (item && item.type === 'folder') {
          if (item.open) openFolders[sanitizeId(item.title)] = true;
          if (item.children) findOpenFolders(item.children);
        }
      });
    })(folderStructure);

    mainNav.innerHTML = '';
    renderSidebar(folderStructure, allContentData, mainNav);
    handleHashChange();

    const prismLink = document.querySelector('link[href*="prism"]');
    prismLink.href = document.body.classList.contains('dark-theme')
      ? 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.28.0/themes/prism-okaidia.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.28.0/themes/prism.min.css';
  }

  window.addEventListener('hashchange', handleHashChange);

  // Swipe gesture handling for mobile
  if (window.innerWidth <= 1024) {
    document.body.addEventListener('touchstart', (e) => {
      // Only detect swipes near the edges (within 50px of the screen edge)
      const touchX = e.changedTouches[0].clientX;
      const screenWidth = window.innerWidth;
      
      // Check if touch is near left edge (within 50px)
      if (touchX <= 50) {
        touchStartX = e.changedTouches[0].screenX;
        document.body.setAttribute('data-swipe-edge', 'left');
      } 
      // Check if touch is near right edge (within 50px)
      else if (touchX >= screenWidth - 50) {
        touchStartX = e.changedTouches[0].screenX;
        document.body.setAttribute('data-swipe-edge', 'right');
      }
    }, false);

    document.body.addEventListener('touchend', (e) => {
      // Only handle swipe if it started near an edge
      const swipeEdge = document.body.getAttribute('data-swipe-edge');
      if (swipeEdge) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipeGesture();
        document.body.removeAttribute('data-swipe-edge');
      }
    }, false);
  }

  // Swipe indicator click handlers
  leftSwipeIndicator.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
    if (document.body.classList.contains('sidebar-open')) {
      document.body.classList.remove('outline-sidebar-open-mobile'); // Close right sidebar if left opens
    }
  });

  rightSwipeIndicator.addEventListener('click', () => {
    document.body.classList.toggle('outline-sidebar-open-mobile');
    if (document.body.classList.contains('outline-sidebar-open-mobile')) {
      document.body.classList.remove('sidebar-open'); // Close left sidebar if right opens
    }
  });

  // Close sidebars when clicking outside on mobile
  document.body.addEventListener('click', (e) => {
    if (window.innerWidth <= 1024) {
      if (document.body.classList.contains('sidebar-open') &&
          !sidebar.contains(e.target) &&
          !leftSwipeIndicator.contains(e.target)) {
        document.body.classList.remove('sidebar-open');
      }
      if (document.body.classList.contains('outline-sidebar-open-mobile') &&
          !outlineSidebar.contains(e.target) &&
          !rightSwipeIndicator.contains(e.target)) {
        document.body.classList.remove('outline-sidebar-open-mobile');
      }
    }
  });

  // Handle window resize to remove sidebars on desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
      document.body.classList.remove('sidebar-open', 'outline-sidebar-open-mobile');
    } else {
      // Re-attach touch listeners if they were removed or not initially attached
      if (!document.body.hasAttribute('data-touch-listeners-attached')) {
        document.body.setAttribute('data-touch-listeners-attached', 'true');
        document.body.addEventListener('touchstart', (e) => {
          touchStartX = e.changedTouches[0].screenX;
        }, false);

        document.body.addEventListener('touchend', (e) => {
          touchEndX = e.changedTouches[0].screenX;
          handleSwipeGesture();
        }, false);
      }
    }
    updateSwipeIndicators();
  });

  // Function to handle swipe gestures
  function handleSwipeGesture() {
    const deltaX = touchEndX - touchStartX;
    const absDeltaX = Math.abs(deltaX);

    // Only consider significant horizontal swipes
    if (absDeltaX > swipeThreshold) {
      if (deltaX > 0) {
        // Swipe right - open left sidebar or close right sidebar
        if (document.body.classList.contains('outline-sidebar-open-mobile')) {
          document.body.classList.remove('outline-sidebar-open-mobile');
        } else if (!document.body.classList.contains('sidebar-open')) {
          document.body.classList.add('sidebar-open');
        }
      } else {
        // Swipe left - open right sidebar or close left sidebar
        if (document.body.classList.contains('sidebar-open')) {
          document.body.classList.remove('sidebar-open');
        } else if (!document.body.classList.contains('outline-sidebar-open-mobile')) {
          document.body.classList.add('outline-sidebar-open-mobile');
        }
      }
    }
  }

  // Update section indicator and outline sidebar visibility on resize
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
      document.body.classList.remove('sidebar-open'); // Ensure mobile left sidebar is closed on desktop
      document.body.classList.remove('outline-sidebar-open-mobile'); // Ensure mobile right sidebar is closed on desktop
      if (outlineList.children.length > 0) {
        document.body.classList.add('outline-sidebar-open'); // Show desktop outline if content exists
      } else {
        document.body.classList.remove('outline-sidebar-open'); // Hide desktop outline if no content
      }
    } else {
      document.body.classList.remove('outline-sidebar-open'); // Always remove desktop outline class on mobile
    }
    updateSwipeIndicators();
  });

  // Initial check for outline sidebar visibility on load and content changes
  const observer = new MutationObserver(() => {
    if (window.innerWidth > 1024) {
      if (outlineList.children.length > 0) {
        document.body.classList.add('outline-sidebar-open');
      } else {
        document.body.classList.remove('outline-sidebar-open');
      }
    }
    updateSwipeIndicators();
  });
  observer.observe(outlineList, { childList: true }); // Observe changes to outlineList

  initialize();
});

(() => {
  const links = Array.from(document.querySelectorAll('[data-gallery-link]'));
  const viewer = document.getElementById('viewer');
  if (!links.length || !viewer || typeof viewer.showModal !== 'function') return;
  const photo = document.getElementById('viewer-image');
  const title = document.getElementById('viewer-title');
  const credit = document.getElementById('viewer-credit');
  const count = document.getElementById('viewer-count');
  let current = 0;
  let opener = null;

  function show(index) {
    current = (index + links.length) % links.length;
    const link = links[current];
    photo.src = link.href;
    photo.alt = link.querySelector('img').alt;
    title.textContent = link.dataset.title;
    credit.textContent = link.dataset.credit;
    count.textContent = `${String(current + 1).padStart(2, '0')} / ${String(links.length).padStart(2, '0')}`;
  }
  links.forEach((link, index) => {
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      opener = link;
      show(index);
      viewer.showModal();
      document.body.classList.add('viewer-open');
    });
  });
  viewer.querySelector('.viewer-close').addEventListener('click', () => viewer.close());
  document.getElementById('viewer-previous').addEventListener('click', () => show(current - 1));
  document.getElementById('viewer-next').addEventListener('click', () => show(current + 1));
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  viewer.addEventListener('click', (event) => {
    if (event.target !== viewer) return;
    const bounds = viewer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) viewer.close();
  });
  viewer.addEventListener('close', () => {
    document.body.classList.remove('viewer-open');
    if (opener) opener.focus({ preventScroll: true });
  });
})();

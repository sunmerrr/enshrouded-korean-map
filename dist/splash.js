(() => {
  const splash = document.getElementById('splash');
  const image = splash.querySelector('img');
  function showCard() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setTimeout(() => splash.remove(), 1000);
    }));
  }
  if (image.complete) {
    if (image.naturalWidth) showCard();
    else splash.remove();
  } else {
    image.addEventListener('load', showCard, {once: true});
    image.addEventListener('error', () => splash.remove(), {once: true});
  }
})();

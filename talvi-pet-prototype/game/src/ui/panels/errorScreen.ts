export function showError(message: string): void {
  const overlay = document.getElementById('overlay'); if (overlay) overlay.replaceChildren();
  const screen = document.createElement('section'); screen.id = 'error-screen';
  const title = document.createElement('h1'); title.dataset.stringKey = 'tpp.error.title'; title.textContent = 'Talvi could not start';
  const detail = document.createElement('p'); detail.textContent = message;
  screen.append(title, detail); document.body.append(screen);
  console.error('app.error', message);
}

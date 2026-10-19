export const THEME_KEY = 'sd-theme';

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the wrong theme.
 * Kept as a string because it executes before React loads.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=t||'system';}catch(e){}})();`;

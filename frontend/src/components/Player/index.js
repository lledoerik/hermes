/**
 * Player Components - Sub-components modulars per al reproductor de vídeo
 *
 * Aquests components divideixen la funcionalitat del Player.js (1781 línies)
 * en components més petits, reutilitzables i mantenibles (<200 línies cada un)
 */

export { default as PlayerControls } from './PlayerControls';
export { default as AudioTrackSelector } from './AudioTrackSelector';
export { default as SubtitleSelector } from './SubtitleSelector';
export { default as NextEpisodeSuggestion } from './NextEpisodeSuggestion';
export { default as SkipIntroButton } from './SkipIntroButton';
export { default as IntroEditor } from './IntroEditor';

// TODO: Afegir més components segons sigui necessari:
// - QualitySelector (per streams adaptatius)
// - MobileControls (controls específics per mòbil)
// - KeyboardShortcuts (hook personalitzat)

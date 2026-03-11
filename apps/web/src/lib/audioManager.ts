// Global audio manager to ensure only one song plays at a time
let currentlyPlaying: HTMLAudioElement | null = null

export function registerAudioElement(audioElement: HTMLAudioElement) {
  // When this audio starts playing, pause any other playing audio
  const handlePlay = () => {
    if (currentlyPlaying && currentlyPlaying !== audioElement) {
      currentlyPlaying.pause()
    }
    currentlyPlaying = audioElement
  }

  const handleEnded = () => {
    if (currentlyPlaying === audioElement) {
      currentlyPlaying = null
    }
  }

  audioElement.addEventListener('play', handlePlay)
  audioElement.addEventListener('ended', handleEnded)
  audioElement.addEventListener('pause', handleEnded)

  // Return cleanup function
  return () => {
    audioElement.removeEventListener('play', handlePlay)
    audioElement.removeEventListener('ended', handleEnded)
    audioElement.removeEventListener('pause', handleEnded)
  }
}

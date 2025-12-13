# Timer Sound Files

This directory should contain audio files for timer notifications.

## Required Files

The timer module looks for the following sound files:

| Filename | Description | Duration |
|----------|-------------|----------|
| `chime.mp3` | Default timer completion sound | 2-3 seconds |
| `gentle.mp3` | Gentle chime for quiet notifications | 2-3 seconds |
| `bell.mp3` | Classic bell sound | 1-2 seconds |
| `ding.mp3` | Simple ding notification | < 1 second |
| `alarm.mp3` | Persistent alarm (loops) | 3-5 seconds |

## Recommended Sources

### Free Sound Libraries
- [Freesound.org](https://freesound.org) - Creative Commons sounds
- [ZapSplat](https://www.zapsplat.com) - Free with attribution
- [Mixkit](https://mixkit.co/free-sound-effects/) - Free notification sounds

### Search Terms
- "chime notification"
- "bell tone"
- "timer complete"
- "gentle alarm"
- "meditation bell"

## Audio Specifications

For best compatibility:
- **Format:** MP3 (most compatible) or OGG
- **Sample Rate:** 44.1 kHz or 48 kHz
- **Bitrate:** 128-192 kbps
- **Channels:** Mono or Stereo

## Adding Custom Sounds

1. Place your audio files in this directory
2. Update your timer configuration to reference the filename:

```javascript
{
    module: "timer",
    config: {
        sound: "custom-sound.mp3",
        // ... other config
    }
}
```

## License Considerations

If distributing your MagicMirror setup:
- Use royalty-free or Creative Commons sounds
- Check attribution requirements
- Some CC licenses require attribution in the UI

## Creating Simple Sounds

You can generate simple tones using command-line tools:

```bash
# Using ffmpeg to generate a 440Hz beep
ffmpeg -f lavfi -i "sine=frequency=440:duration=0.5" -c:a libmp3lame chime.mp3

# Using SoX (Sound eXchange)
sox -n chime.mp3 synth 0.5 sine 440 fade l 0 0.5 0.3
```

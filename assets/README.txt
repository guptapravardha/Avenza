hero-frames/ contains the extracted frame sequence (frame_0001.jpg … frame_0180.jpg)
used to drive the cinematic scroll hero. These were sampled from the original
hero video at ~3.6fps across its 50s runtime, resized to 1280px wide JPGs.

The hero no longer uses a <video> element — js/main.js paints these frames onto
a <canvas id="heroCanvas"> based on scroll progress via GSAP ScrollTrigger, with
lerp'd interpolation for smoothness and progressive/batched image preloading.

To swap in a different source video, re-run:
  ffmpeg -i your-video.mp4 -vf "fps=3.6,scale=1280:-2" -q:v 3 assets/hero-frames/frame_%04d.jpg
and update FRAME_COUNT in js/main.js if the frame total changes.

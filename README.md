# Interactive image Fourier analysis website

This hosts the code and files for a website that allows for interactive exploration of image Fourier analysis&mdash;potentially useful for teaching.

See [this blog post](https://www.djmannion.net/img_freq_web_post/) for more background.

Contents:

* [Demonstration](https://github.com/djmannion/img_freq_web#demonstration)
* [Features](https://github.com/djmannion/img_freq_web#features)
* [Current limitations](https://github.com/djmannion/img_freq_web#current-limitations)
* [Hosting](https://github.com/djmannion/img_freq_web#hosting)
* [Building](https://github.com/djmannion/img_freq_web#building)
* [Author](https://github.com/djmannion/img_freq_web#author)

## Demonstration

### Website

A demonstration version is available on [this website](https://www.djmannion.net/img_freq_web).

### Video

https://user-images.githubusercontent.com/1371039/128455842-55893360-0714-4080-bcda-9a6eb98ad8de.mp4

## Features

* All calculations performed entirely within the browser.
* Includes example natural and synthetic images.
* Custom images can be uploaded or grabbed from a webcam.
* Windowing can be applied to the input image.
* Amplitude spectrum displayed on either log-polar or (zoomable) Cartesian axes.
* Optionally shows the spatial frequency slope.
* Can set low-pass, high-pass, or band-pass filters and see the reconstructed output.
* Output can be saved to the local computer.

## Current limitations

* Untested on Safari and Edge.
* Webcam doesn't seem to work on mobile devices (can upload from camera, though).
* Widget layout is relatively unstyled.
* Page layout could be improved&mdash;ideally the key components would be visible without scrolling.
* No explanatory prose.
* Needs some visual indicator when updating the output.
* Missing axis labels on the non-image canvases.
* Some more example images could be added.

## Hosting

Copy the files in the `site` directory to a web server.

## Building

If you would like to make any changes or fixes, the JavaScript will need to be re-compiled using [`node.js`](https://nodejs.org/).
This is because the site uses functionality from the great set of [`scijs`](https://github.com/scijs) packages.

### Install the necessary packages

```bash
npm ci
```

### (Optionally) Run the linter

```bash
npm run lint
```

### Compile

```bash
npm run build
```

# Author

**Damien Mannion**

* [Profile](https://github.com/djmannion)
* [Email](mailto:damien@djmannion.net)
* [Website](https://www.djmannion.net)

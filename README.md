# Interactive image Fourier analysis website

This hosts the code and files for a website that allows for interactive exploration of image Fourier analysis.

Contents:

* [Demonstration](https://github.com/djmannion/img_freq_web#demonstration)
* [Features](https://github.com/djmannion/img_freq_web#features)
* [Current limitations](https://github.com/djmannion/img_freq_web#current-limitations)
* [Hosting](https://github.com/djmannion/img_freq_web#hosting)
* [Building](https://github.com/djmannion/img_freq_web#building)

## Demonstration

A demonstration version is available on [this website](https://www.djmannion.net/img_freq_web).

## Features

* Input images can be uploaded or grabbed from a webcam.
* Windowing can be applied to the input image.
* Amplitude spectrum displayed on either log-polar or (zoomable) cartesian axes.
* Optionally shows the spatial frequency slope.
* Can set low-pass, high-pass, or band-pass filters and see the reconstructed output.

## Current limitations

* Untested on Safari.
* Hard edges on the window and filter need softening.
* No specific mobile device support.
* Widget layout is relatively unstyled.
* Page layout could be improved&mdash;ideally the key components would be visible without scrolling.
* No explanatory prose.
* Needs some visual indicator when updating the output.
* Missing axis labels on the non-image canvases.

## Hosting

Copy the files in the `site` directory to a web server.

## Building

If you would like to make any changes or fixes, the javascript will need to be re-compiled using [`node.js`](https://nodejs.org/).
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

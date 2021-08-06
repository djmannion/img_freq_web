"use strict";


async function exportOutput(data) {

    data.el.canvas.output.toBlob(
        function(blob) {

            const download = document.createElement("a");

            download.download = "web_img_freq_export.png";
            download.href = window.URL.createObjectURL(blob);
            download.click();

        }
    );

}


module.exports = {
    exportOutput: exportOutput,
};

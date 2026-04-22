var jsPsychOddOneOut = (function (jspsych) {
  'use strict';

  var version = "1.0.0";

  const info = {
    name: "odd-one-out",
    version: version,
    parameters: {
      /** Category name shown in the prompt (e.g. "spoons"). Rendered uppercase. */
      category: {
        type: jspsych.ParameterType.STRING,
        default: undefined,
      },
      /** Array of image objects to display. Each entry defines a single image and its placement. */
      images: {
        type: jspsych.ParameterType.COMPLEX,
        default: undefined,
        array: true,
        nested: {
          /** Image filename, resolved relative to `base_path`. */
          file:     { type: jspsych.ParameterType.STRING, default: undefined },
          /** X position of image center, as % of search area width (0–100). */
          x:        { type: jspsych.ParameterType.FLOAT,  default: undefined },
          /** Y position of image center, as % of search area height (0–100). */
          y:        { type: jspsych.ParameterType.FLOAT,  default: undefined },
          /** Rotation applied to the image, in degrees. */
          rotation: { type: jspsych.ParameterType.FLOAT,  default: 0 },
          /** True if this image is the odd-one-out. (Informational — correctness uses `odd_file`.) */
          is_odd:   { type: jspsych.ParameterType.BOOL,   default: false },
        },
      },
      /** Path prefix prepended to each image's `file` (e.g. "stimuli/present/spoons/"). */
      base_path: {
        type: jspsych.ParameterType.STRING,
        default: "",
      },
      /** Whether an odd image exists on this trial. Determines the correct response. */
      target_present: {
        type: jspsych.ParameterType.BOOL,
        default: false,
      },
      /** Filename of the odd image when `target_present` is true; null otherwise. */
      odd_file: {
        type: jspsych.ParameterType.STRING,
        default: null,
      },
      /** Image display size as % of the search area width. */
      image_size_percent: {
        type: jspsych.ParameterType.FLOAT,
        default: 10,
      },
      /** If true, reveal the correct answer after the participant confirms, and require a Continue click to advance. */
      show_answer: {
        type: jspsych.ParameterType.BOOL,
        default: false,
      },
    },
    data: {
      /** Participant's confirmed response: either the filename of a clicked image, or the string "all_fit". */
      response:       { type: jspsych.ParameterType.STRING },
      /** Whether the confirmed response was correct. */
      correct:        { type: jspsych.ParameterType.BOOL },
      /** Time from trial onset to first click (ms). */
      first_click_rt: { type: jspsych.ParameterType.INT },
      /** Time from trial onset to the Confirm click (ms). */
      confirm_rt:     { type: jspsych.ParameterType.INT },
      /** Time between the first click and the Confirm click (ms). */
      decision_time:  { type: jspsych.ParameterType.INT },
    },
  };

  class OddOneOutPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const self = this;

      const trialStartTime = performance.now();
      let firstClickTime   = null;
      let confirmTime      = null;
      let selectedElement  = null;
      let selectedResponse = null;
      let trialCorrect     = null;

      const style = document.createElement("style");
      style.id = "oot-styles";
      style.textContent = `
        #oot-wrapper {
          position: fixed;
          top: 0; left: 0;
          width: 100vw;
          height: 100vh;
          background: #ffffff;
          overflow: hidden;
          font-family: 'Segoe UI', system-ui, sans-serif;
          user-select: none;
        }
        #oot-prompt {
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 7%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: clamp(14px, 2.2vw, 26px);
          font-weight: 600;
          letter-spacing: 0.03em;
          color: #1a1a2e;
          background: #f8f8fc;
          border-bottom: 2px solid #e0e0f0;
          z-index: 10;
          pointer-events: none;
          box-sizing: border-box;
        }
        #oot-prompt span {
          color: #4f46e5;
          text-transform: uppercase;
          margin: 0 6px;
        }
        #oot-search-area {
          position: absolute;
          top: 7%;
          left: 0;
          width: 100%;
          height: 83%;
        }
        .oot-img-wrapper {
          position: absolute;
          transform-origin: center center;
          cursor: pointer;
          border-radius: 8px;
          transition: outline 80ms ease, box-shadow 80ms ease;
          outline: 3px solid transparent;
          box-sizing: border-box;
        }
        .oot-img-wrapper img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 6px;
          pointer-events: none;
          -webkit-user-drag: none;
        }
        .oot-img-wrapper.oot-selected {
          outline: 4px solid #4f46e5;
          box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.18);
        }
        .oot-img-wrapper:hover:not(.oot-selected):not(.oot-correct):not(.oot-incorrect) {
          outline: 3px solid rgba(79, 70, 229, 0.35);
        }
        .oot-img-wrapper.oot-correct {
          outline: 4px solid #16a34a;
          box-shadow: 0 0 0 6px rgba(22, 163, 74, 0.22);
        }
        .oot-img-wrapper.oot-incorrect {
          outline: 4px solid #dc2626;
          box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.22);
        }
        #oot-all-fit-btn.oot-correct {
          background: #16a34a;
          border-color: #16a34a;
          color: #ffffff;
        }
        #oot-all-fit-btn.oot-incorrect {
          background: #dc2626;
          border-color: #dc2626;
          color: #ffffff;
        }
        #oot-bottom-bar {
          position: absolute;
          bottom: 0; left: 0;
          width: 100%;
          height: 10%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          background: #f8f8fc;
          border-top: 2px solid #e0e0f0;
          z-index: 10;
          box-sizing: border-box;
        }
        .oot-btn {
          padding: 10px 28px;
          border: 2px solid transparent;
          border-radius: 8px;
          font-size: clamp(13px, 1.6vw, 18px);
          font-weight: 600;
          cursor: pointer;
          transition: all 100ms ease;
          white-space: nowrap;
        }
        #oot-all-fit-btn {
          background: #ffffff;
          border-color: #c7c7e0;
          color: #1a1a2e;
        }
        #oot-all-fit-btn:hover:not(.oot-selected):not(.oot-correct):not(.oot-incorrect) {
          border-color: #4f46e5;
          color: #4f46e5;
        }
        #oot-all-fit-btn.oot-selected {
          background: #4f46e5;
          border-color: #4f46e5;
          color: #ffffff;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.22);
        }
        #oot-confirm-btn {
          background: #16a34a;
          border-color: #16a34a;
          color: #ffffff;
          display: none;
        }
        #oot-confirm-btn:hover {
          background: #15803d;
        }
        #oot-confirm-btn.oot-visible {
          display: inline-block;
        }
        #oot-answer-banner {
          display: none;
          position: absolute;
          top: 7%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20;
          padding: 10px 32px;
          border-radius: 0 0 10px 10px;
          font-size: clamp(14px, 1.8vw, 20px);
          font-weight: 700;
          letter-spacing: 0.04em;
          pointer-events: none;
        }
        #oot-answer-banner.oot-banner-correct {
          background: #16a34a;
          color: #fff;
          display: block;
        }
        #oot-answer-banner.oot-banner-incorrect {
          background: #dc2626;
          color: #fff;
          display: block;
        }
        #oot-continue-btn {
          background: #4f46e5;
          border-color: #4f46e5;
          color: #ffffff;
          display: none;
        }
        #oot-continue-btn.oot-visible {
          display: inline-block;
        }
      `;
      document.head.appendChild(style);

      display_element.innerHTML = [
        '<div id="oot-wrapper">',
          '<div id="oot-prompt">',
            'Are ALL of these <span>' + trial.category.toUpperCase() + '</span> ?',
          '</div>',
          '<div id="oot-search-area"></div>',
          '<div id="oot-answer-banner"></div>',
          '<div id="oot-bottom-bar">',
            '<button class="oot-btn" id="oot-all-fit-btn">&#10003; All fit the category</button>',
            '<button class="oot-btn" id="oot-confirm-btn">Confirm &rarr;</button>',
            '<button class="oot-btn" id="oot-continue-btn">Continue &rarr;</button>',
          '</div>',
        '</div>',
      ].join("");

      const searchArea = display_element.querySelector("#oot-search-area");
      const allFitBtn  = display_element.querySelector("#oot-all-fit-btn");
      const confirmBtn = display_element.querySelector("#oot-confirm-btn");
      const continueBtn = display_element.querySelector("#oot-continue-btn");
      const banner     = display_element.querySelector("#oot-answer-banner");

      const areaW = searchArea.offsetWidth;
      const areaH = searchArea.offsetHeight;
      const imgPx = (trial.image_size_percent / 100) * areaW;

      trial.images.forEach(function (imgData) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("oot-img-wrapper");
        wrapper.dataset.file = imgData.file;

        const leftPx = (imgData.x / 100) * areaW - imgPx / 2;
        const topPx  = (imgData.y / 100) * areaH - imgPx / 2;

        wrapper.style.width     = imgPx + "px";
        wrapper.style.height    = imgPx + "px";
        wrapper.style.left      = leftPx + "px";
        wrapper.style.top       = topPx  + "px";
        wrapper.style.transform = "rotate(" + (imgData.rotation || 0) + "deg)";

        const img = document.createElement("img");
        img.src = trial.base_path + imgData.file;
        img.alt = "";

        wrapper.appendChild(img);
        wrapper.addEventListener("click", function () {
          handleSelection(wrapper, imgData.file);
        });
        searchArea.appendChild(wrapper);
      });

      allFitBtn.addEventListener("click", function () {
        handleSelection(allFitBtn, "all_fit");
      });
      confirmBtn.addEventListener("click", handleConfirm);
      continueBtn.addEventListener("click", handleContinue);

      function handleSelection(element, responseValue) {
        if (firstClickTime === null) {
          firstClickTime = performance.now();
        }
        if (selectedElement) {
          selectedElement.classList.remove("oot-selected");
        }
        element.classList.add("oot-selected");
        selectedElement  = element;
        selectedResponse = responseValue;
        confirmBtn.classList.add("oot-visible");
      }

      function handleConfirm() {
        if (!selectedElement) return;

        confirmTime = performance.now();
        const response = selectedResponse;

        if (trial.target_present) {
          trialCorrect = response === trial.odd_file;
        } else {
          trialCorrect = response === "all_fit";
        }

        if (trial.show_answer) {
          display_element.querySelectorAll(".oot-img-wrapper").forEach(function (w) {
            w.style.pointerEvents = "none";
          });
          allFitBtn.style.pointerEvents = "none";
          confirmBtn.classList.remove("oot-visible");

          selectedElement.classList.remove("oot-selected");
          selectedElement.classList.add(trialCorrect ? "oot-correct" : "oot-incorrect");

          if (!trialCorrect && trial.target_present) {
            display_element.querySelectorAll(".oot-img-wrapper").forEach(function (w) {
              if (w.dataset.file === trial.odd_file) {
                w.classList.add("oot-correct");
              }
            });
          }
          if (!trialCorrect && !trial.target_present) {
            allFitBtn.classList.remove("oot-selected");
            allFitBtn.classList.add("oot-correct");
            selectedElement.classList.add("oot-incorrect");
          }

          banner.textContent = trialCorrect ? "Correct!" : "Incorrect!";
          banner.className   = trialCorrect ? "oot-banner-correct" : "oot-banner-incorrect";

          continueBtn.classList.add("oot-visible");
        } else {
          endTrial(response);
        }
      }

      function handleContinue() {
        endTrial(selectedResponse);
      }

      function endTrial(response) {
        const now = performance.now();

        const trialData = {
          response:       response,
          correct:        trialCorrect,
          first_click_rt: firstClickTime !== null
                            ? Math.round(firstClickTime - trialStartTime)
                            : null,
          confirm_rt:     confirmTime !== null
                            ? Math.round(confirmTime - trialStartTime)
                            : Math.round(now - trialStartTime),
          decision_time:  firstClickTime !== null && confirmTime !== null
                            ? Math.round(confirmTime - firstClickTime)
                            : null,
        };

        const injectedStyle = document.getElementById("oot-styles");
        if (injectedStyle) injectedStyle.remove();

        display_element.innerHTML = "";
        self.jsPsych.finishTrial(trialData);
      }
    }
  }

  OddOneOutPlugin.info = info;
  return OddOneOutPlugin;

})(jsPsychModule);

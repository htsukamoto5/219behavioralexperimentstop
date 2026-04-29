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
      /** If true, reveal the correct answer after the participant clicks, and require a Continue click to advance. */
      show_answer: {
        type: jspsych.ParameterType.BOOL,
        default: false,
      },
      /** Total number of experimental trials, shown in the progress counter (e.g. "Trial 5 of 60"). */
      total_trials: {
        type: jspsych.ParameterType.INT,
        default: null,
      },
    },
    data: {
      /** Participant's response: either the filename of the clicked image, or the string "all_fit". */
      response: { type: jspsych.ParameterType.STRING },
      /** Whether the response was correct. */
      correct:  { type: jspsych.ParameterType.BOOL },
      /** Time from trial onset to the response click (ms). */
      rt:       { type: jspsych.ParameterType.INT },
    },
  };

  class OddOneOutPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const self = this;

      const trialStartTime = performance.now();
      let response       = null;
      let responseRT     = null;
      let trialCorrect   = null;

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
            'Are ALL of these <span>' + trial.category + '</span>? If not, click the item that does not fit the category.',
          '</div>',
          '<div id="oot-search-area"></div>',
          '<div id="oot-answer-banner"></div>',
          '<div id="oot-bottom-bar">',
            '<button class="oot-btn" id="oot-all-fit-btn">&#10003; All fit the category</button>',
            '<button class="oot-btn" id="oot-continue-btn">Continue &rarr;</button>',
            (trial.data && trial.data.trial_index && trial.total_trials
              ? '<span id="oot-progress" style="position:absolute;right:20px;font-size:clamp(11px,1.2vw,15px);color:#9090b0;font-family:system-ui,sans-serif;pointer-events:none;">Trial ' + trial.data.trial_index + ' of ' + trial.total_trials + '</span>'
              : ''),
          '</div>',
        '</div>',
      ].join("");

      const searchArea  = display_element.querySelector("#oot-search-area");
      const allFitBtn   = display_element.querySelector("#oot-all-fit-btn");
      const continueBtn = display_element.querySelector("#oot-continue-btn");
      const banner      = display_element.querySelector("#oot-answer-banner");

      const areaW = searchArea.offsetWidth;
      const areaH = searchArea.offsetHeight;
      const imgPx = (trial.image_size_percent / 100) * areaW;
      
      const PADDING = 0.05; // 5% margin from edges
      const imgPercent = trial.image_size_percent / 100;

      // Build a grid with enough cells, then shuffle and assign
      const n = trial.images.length;
      const cols = Math.ceil(Math.sqrt(n * (areaW / areaH)));
      const rows = Math.ceil(n / cols);

      // Generate grid cell centers, add jitter, shuffle
      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = PADDING + (c + 0.5) * ((1 - 2 * PADDING) / cols);
          const cy = PADDING + (r + 0.5) * ((1 - 2 * PADDING) / rows);
          // Add small jitter so it doesn't look like a rigid grid
          const jitterX = (Math.random() - 0.5) * (0.4 / cols);
          const jitterY = (Math.random() - 0.5) * (0.4 / rows);
          cells.push({
            x: Math.max(PADDING, Math.min(1 - PADDING, cx + jitterX)),
            y: Math.max(PADDING, Math.min(1 - PADDING, cy + jitterY)),
          });
        }
      }
      // Shuffle cells
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }

      trial.images.forEach(function (imgData, idx) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("oot-img-wrapper");
        wrapper.dataset.file = imgData.file;

        const pos = cells[idx];
        const leftPx = pos.x * areaW - imgPx / 2;
        const topPx  = pos.y * areaH - imgPx / 2;

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
          handleResponse(wrapper, imgData.file);
        });
        searchArea.appendChild(wrapper);
      });

      allFitBtn.addEventListener("click", function () {
        handleResponse(allFitBtn, "all_fit");
      });
      continueBtn.addEventListener("click", endTrial);

      function handleResponse(element, responseValue) {
        // Lock in the first click — guard against double-clicks or post-feedback clicks.
        if (response !== null) return;

        responseRT = performance.now() - trialStartTime;
        response   = responseValue;

        if (trial.target_present) {
          trialCorrect = response === trial.odd_file;
        } else {
          trialCorrect = response === "all_fit";
        }

        // Disable further interaction
        display_element.querySelectorAll(".oot-img-wrapper").forEach(function (w) {
          w.style.pointerEvents = "none";
        });
        allFitBtn.style.pointerEvents = "none";

        if (trial.show_answer) {
          element.classList.add(trialCorrect ? "oot-correct" : "oot-incorrect");

          if (!trialCorrect && trial.target_present) {
            display_element.querySelectorAll(".oot-img-wrapper").forEach(function (w) {
              if (w.dataset.file === trial.odd_file) {
                w.classList.add("oot-correct");
              }
            });
          }
          if (!trialCorrect && !trial.target_present) {
            allFitBtn.classList.add("oot-correct");
          }

          banner.textContent = trialCorrect ? "Correct!" : "Incorrect!";
          banner.className   = trialCorrect ? "oot-banner-correct" : "oot-banner-incorrect";

          continueBtn.classList.add("oot-visible");
        } else {
          endTrial();
        }
      }

      function endTrial() {
        const trialData = {
          response: response,
          correct:  trialCorrect,
          rt:       responseRT !== null ? Math.round(responseRT) : null,
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

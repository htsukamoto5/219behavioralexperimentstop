/**
 * jspsych-odd-one-out.js
 *
 * Custom jsPsych plugin for the odd-one-out categorisation task.
 * Plain script version — load via <script> tag after jspsych.js.
 *
 * Each trial:
 *  1. Shows a category label at the top ("Are all of these SPOONS?")
 *  2. Displays 16 images at pre-computed positions with optional rotation
 *  3. An "All fit the category" button sits in the bottom bar
 *  4. Participant clicks any image OR the all-fit button → it highlights
 *  5. A "Confirm" button appears → participant clicks to finalise
 *  6. Records:
 *       first_click_rt  : ms from trial start to first click
 *       confirm_rt      : ms from trial start to confirm click
 *       decision_time   : ms between first click and confirm
 *       response        : "all_fit" | filename of clicked image
 *       correct         : boolean
 *       target_present  : boolean
 *       category        : string
 *
 * Parameters (passed in the jsPsych trial object):
 *   category           {string}       Display name, e.g. "spoons"
 *   images             {Array}        Image objects from trials.json:
 *                                     { file, x, y, rotation, is_odd }
 *   base_path          {string}       Path prefix, e.g. "stimuli/present/spoons/"
 *   target_present     {boolean}      Whether an odd image exists this trial
 *   odd_file           {string|null}  Filename of the odd image, or null
 *   image_size_percent {number}       Image size as % of search area width (default 10)
 *   show_answer        {boolean}      If true, highlight correct answer after confirm (default false)
 */

var jsPsychOddOneOut = (function (jspsych) {

  var info = {
    name: "odd-one-out",
    parameters: {
      category:           { type: jspsych.ParameterType.STRING,  default: undefined },
      images:             { type: jspsych.ParameterType.COMPLEX,  default: undefined },
      base_path:          { type: jspsych.ParameterType.STRING,  default: "" },
      target_present:     { type: jspsych.ParameterType.BOOL,    default: false },
      odd_file:           { type: jspsych.ParameterType.STRING,  default: null },
      image_size_percent: { type: jspsych.ParameterType.FLOAT,   default: 10 },
      show_answer:        { type: jspsych.ParameterType.BOOL,    default: false },
    },
  };

  class OddOneOutPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      var self = this;

      // ── Timing bookmarks ──────────────────────────────────────────────────
      var trialStartTime   = performance.now();
      var firstClickTime   = null;
      var selectedElement  = null;
      var selectedResponse = null;

      // ── Inject styles ─────────────────────────────────────────────────────
      var style    = document.createElement("style");
      style.id     = "oot-styles";
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
        /* Answer-reveal highlight colours */
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
          visibility: hidden;
        }
        #oot-confirm-btn:hover {
          background: #15803d;
        }
        #oot-confirm-btn.oot-visible {
          visibility: visible;
        }

        /* Answer-reveal overlay banner */
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

        /* Continue button shown after answer reveal */
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

      // ── Build HTML ────────────────────────────────────────────────────────
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

      // ── Render images ─────────────────────────────────────────────────────
      var searchArea = document.getElementById("oot-search-area");
      var areaW      = searchArea.offsetWidth;
      var areaH      = searchArea.offsetHeight;
      var imgPx      = (trial.image_size_percent / 100) * areaW;

      trial.images.forEach(function (imgData) {
        var wrapper = document.createElement("div");
        wrapper.classList.add("oot-img-wrapper");
        wrapper.dataset.file = imgData.file;

        var leftPx = (imgData.x / 100) * areaW - imgPx / 2;
        var topPx  = (imgData.y / 100) * areaH - imgPx / 2;

        wrapper.style.width     = imgPx + "px";
        wrapper.style.height    = imgPx + "px";
        wrapper.style.left      = leftPx + "px";
        wrapper.style.top       = topPx  + "px";
        wrapper.style.transform = "rotate(" + imgData.rotation + "deg)";

        var img = document.createElement("img");
        img.src = trial.base_path + imgData.file;
        img.alt = "";

        wrapper.appendChild(img);
        wrapper.addEventListener("click", function () {
          handleSelection(wrapper, imgData.file);
        });
        searchArea.appendChild(wrapper);
      });

      // ── Button references ─────────────────────────────────────────────────
      var allFitBtn   = document.getElementById("oot-all-fit-btn");
      var confirmBtn  = document.getElementById("oot-confirm-btn");
      var continueBtn = document.getElementById("oot-continue-btn");
      var banner      = document.getElementById("oot-answer-banner");

      allFitBtn.addEventListener("click", function () {
        handleSelection(allFitBtn, "all_fit");
      });
      confirmBtn.addEventListener("click", handleConfirm);
      continueBtn.addEventListener("click", handleContinue);

      // ── Selection handler ─────────────────────────────────────────────────
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

      // ── Confirm handler ───────────────────────────────────────────────────
      var confirmTime   = null;
      var trialCorrect  = null;

      function handleConfirm() {
        if (!selectedElement) return;

        confirmTime  = performance.now();
        var response = selectedResponse;

        if (trial.target_present) {
          trialCorrect = response === trial.odd_file;
        } else {
          trialCorrect = response === "all_fit";
        }

        if (trial.show_answer) {
          // ── Reveal mode: show correct/incorrect feedback, then wait ───────
          // Disable all image clicks and buttons during reveal
          document.querySelectorAll(".oot-img-wrapper").forEach(function (w) {
            w.style.pointerEvents = "none";
          });
          allFitBtn.style.pointerEvents = "none";
          confirmBtn.classList.remove("oot-visible");

          // Highlight the participant's selection as correct or incorrect
          selectedElement.classList.remove("oot-selected");
          selectedElement.classList.add(trialCorrect ? "oot-correct" : "oot-incorrect");

          // If they were wrong AND target is present, also highlight the right answer
          if (!trialCorrect && trial.target_present) {
            document.querySelectorAll(".oot-img-wrapper").forEach(function (w) {
              if (w.dataset.file === trial.odd_file) {
                w.classList.add("oot-correct");
              }
            });
          }
          // If they clicked an image but all-fit was correct, highlight all-fit button
          if (!trialCorrect && !trial.target_present) {
            allFitBtn.classList.remove("oot-selected");
            allFitBtn.classList.add("oot-correct");
            selectedElement.classList.add("oot-incorrect");
          }

          // Show banner
          banner.textContent = trialCorrect ? "Correct!" : "Incorrect!";
          banner.className   = trialCorrect ? "oot-banner-correct" : "oot-banner-incorrect";

          // Show continue button
          continueBtn.classList.add("oot-visible");

        } else {
          // ── Normal mode: finish immediately ──────────────────────────────
          endTrial(response);
        }
      }

      // ── Continue handler (only used in show_answer mode) ──────────────────
      function handleContinue() {
        endTrial(selectedResponse);
      }

      // ── Finish trial ──────────────────────────────────────────────────────
      function endTrial(response) {
        var now = performance.now();

        var trialData = {
          category:       trial.category,
          target_present: trial.target_present,
          odd_file:       trial.odd_file,
          response:       response,
          correct:        trialCorrect !== null ? trialCorrect : (
            trial.target_present
              ? response === trial.odd_file
              : response === "all_fit"
          ),
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

        // Clean up injected styles
        var injectedStyle = document.getElementById("oot-styles");
        if (injectedStyle) injectedStyle.remove();

        display_element.innerHTML = "";
        self.jsPsych.finishTrial(trialData);
      }
    }
  }

  OddOneOutPlugin.info = info;
  return OddOneOutPlugin;

// FIX: use the global name the CDN actually exposes
})(jsPsych);

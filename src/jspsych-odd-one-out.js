/**
 * jspsych-odd-one-out.js
 * 
 * Custom jsPsych plugin for the odd-one-out categorisation task.
 * 
 * Each trial:
 *  1. Shows a category label at the top ("Are all of these SPOONS?")
 *  2. Displays 16 images at pre-computed positions with optional rotation
 *  3. An "All fit the category" button sits below the display area
 *  4. Participant clicks any image OR the all-fit button → it highlights (selection phase)
 *  5. A "Confirm" button appears → participant clicks to finalise (confirmation phase)
 *  6. Records:
 *       - first_click_rt       : ms from trial start to first click
 *       - confirm_rt           : ms from trial start to confirm click
 *       - decision_time        : ms between first click and confirm (deliberation window)
 *       - response             : "all_fit" | filename of clicked image
 *       - correct              : boolean
 *       - target_present       : boolean
 * 
 * Parameters (passed via jsPsych trial object):
 *   category        {string}   Display name shown in the prompt, e.g. "spoons"
 *   images          {Array}    Array of image objects from trials.json:
 *                              { file, x, y, rotation, is_odd }
 *   base_path       {string}   Path prefix for images, e.g. "stimuli/spoons/"
 *   target_present  {boolean}  Whether an odd image exists in this trial
 *   odd_file        {string|null} Filename of the odd image (or null)
 * 
 * Usage:
 *   import OddOneOutPlugin from "./jspsych-odd-one-out.js";
 *   ...
 *   { type: OddOneOutPlugin, category: "spoons", images: [...], ... }
 */

import { JsPsych, JsPsychPlugin, ParameterType, TrialType } from "jspsych";

const info = /** @type {const} */ ({
  name: "odd-one-out",
  parameters: {
    category: {
      type: ParameterType.STRING,
      default: undefined,
    },
    images: {
      type: ParameterType.COMPLEX,
      default: undefined,
    },
    base_path: {
      type: ParameterType.STRING,
      default: "",
    },
    target_present: {
      type: ParameterType.BOOL,
      default: false,
    },
    odd_file: {
      type: ParameterType.STRING,
      default: null,
    },
    // Size of each image as a % of the display area width
    image_size_percent: {
      type: ParameterType.FLOAT,
      default: 10,
    },
  },
});

class OddOneOutPlugin {
  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(display_element, trial) {
    // ── Timing bookmarks ────────────────────────────────────────────────────
    const trialStartTime = performance.now();
    let firstClickTime   = null;
    let selectedElement  = null;   // DOM node currently highlighted

    // ── Build HTML ───────────────────────────────────────────────────────────

    // Outer wrapper fills the viewport
    display_element.innerHTML = `
      <style>
        #oot-wrapper {
          position: relative;
          width: 100vw;
          height: 100vh;
          background: #ffffff;
          overflow: hidden;
          font-family: 'Segoe UI', system-ui, sans-serif;
          user-select: none;
        }

        /* ── Prompt bar ── */
        #oot-prompt {
          position: absolute;
          top: 0;
          left: 0;
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
        }
        #oot-prompt span {
          color: #4f46e5;
          text-transform: uppercase;
        }

        /* ── Search area ── */
        #oot-search-area {
          position: absolute;
          top: 7%;
          left: 0;
          width: 100%;
          height: 83%;   /* leaves room for bottom bar */
        }

        /* ── Individual image tiles ── */
        .oot-img-wrapper {
          position: absolute;
          transform-origin: center center;
          cursor: pointer;
          border-radius: 8px;
          transition: outline 80ms ease, box-shadow 80ms ease;
          outline: 3px solid transparent;
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
        .oot-img-wrapper.selected {
          outline: 4px solid #4f46e5;
          box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.18);
        }
        .oot-img-wrapper:hover:not(.selected) {
          outline: 3px solid rgba(79, 70, 229, 0.35);
        }

        /* ── Bottom bar ── */
        #oot-bottom-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 10%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          background: #f8f8fc;
          border-top: 2px solid #e0e0f0;
          z-index: 10;
        }

        /* ── Buttons ── */
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
        #oot-all-fit-btn:hover:not(.selected) {
          border-color: #4f46e5;
          color: #4f46e5;
        }
        #oot-all-fit-btn.selected {
          background: #4f46e5;
          border-color: #4f46e5;
          color: #ffffff;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.22);
        }
        #oot-confirm-btn {
          background: #16a34a;
          border-color: #16a34a;
          color: #ffffff;
          display: none;   /* hidden until a selection is made */
        }
        #oot-confirm-btn:hover {
          background: #15803d;
        }
        #oot-confirm-btn.visible {
          display: inline-block;
        }
      </style>

      <div id="oot-wrapper">
        <div id="oot-prompt">
          Are ALL of these &nbsp;<span>${trial.category.toUpperCase()}</span>&nbsp;?
        </div>

        <div id="oot-search-area"></div>

        <div id="oot-bottom-bar">
          <button class="oot-btn" id="oot-all-fit-btn">✓ All fit the category</button>
          <button class="oot-btn" id="oot-confirm-btn">Confirm →</button>
        </div>
      </div>
    `;

    // ── Render images ────────────────────────────────────────────────────────

    const searchArea = display_element.querySelector("#oot-search-area");
    const areaW      = searchArea.offsetWidth;
    const areaH      = searchArea.offsetHeight;
    const imgPx      = (trial.image_size_percent / 100) * areaW;

    trial.images.forEach((imgData) => {
      const wrapper = document.createElement("div");
      wrapper.classList.add("oot-img-wrapper");
      wrapper.dataset.file = imgData.file;

      // Centre the image on the stored x/y percentage position
      const leftPx = (imgData.x / 100) * areaW - imgPx / 2;
      const topPx  = (imgData.y / 100) * areaH - imgPx / 2;

      wrapper.style.width    = `${imgPx}px`;
      wrapper.style.height   = `${imgPx}px`;
      wrapper.style.left     = `${leftPx}px`;
      wrapper.style.top      = `${topPx}px`;
      wrapper.style.transform = `rotate(${imgData.rotation}deg)`;

      const img = document.createElement("img");
      img.src = trial.base_path + imgData.file;
      img.alt = "";

      wrapper.appendChild(img);
      wrapper.addEventListener("click", () => handleSelection(wrapper, imgData.file));
      searchArea.appendChild(wrapper);
    });

    // ── Button listeners ─────────────────────────────────────────────────────

    const allFitBtn  = display_element.querySelector("#oot-all-fit-btn");
    const confirmBtn = display_element.querySelector("#oot-confirm-btn");

    allFitBtn.addEventListener("click", () => handleSelection(allFitBtn, "all_fit"));
    confirmBtn.addEventListener("click", () => handleConfirm());

    // ── Selection logic ───────────────────────────────────────────────────────

    function handleSelection(element, responseValue) {
      // Record first-click time only once
      if (firstClickTime === null) {
        firstClickTime = performance.now();
      }

      // Deselect previously selected element
      if (selectedElement) {
        selectedElement.classList.remove("selected");
      }

      // Select new element
      element.classList.add("selected");
      selectedElement = element;
      element._responseValue = responseValue;

      // Show confirm button
      confirmBtn.classList.add("visible");
    }

    // ── Confirmation logic ────────────────────────────────────────────────────

    function handleConfirm() {
      if (!selectedElement) return;

      const confirmTime  = performance.now();
      const response     = selectedElement._responseValue;

      // Determine correctness
      let correct;
      if (trial.target_present) {
        // Correct = clicked the odd image
        correct = response === trial.odd_file;
      } else {
        // Correct = clicked "all fit"
        correct = response === "all_fit";
      }

      // Package data for jsPsych
      const trialData = {
        category:           trial.category,
        target_present:     trial.target_present,
        odd_file:           trial.odd_file,
        response,
        correct,
        first_click_rt:     firstClickTime !== null
                              ? Math.round(firstClickTime - trialStartTime)
                              : null,
        confirm_rt:         Math.round(confirmTime - trialStartTime),
        decision_time:      firstClickTime !== null
                              ? Math.round(confirmTime - firstClickTime)
                              : null,
      };

      display_element.innerHTML = "";
      this.jsPsych.finishTrial(trialData);
    }

    // Bind confirm handler to class instance so `this` is correct
    handleConfirm = handleConfirm.bind(this);
  }
}

OddOneOutPlugin.info = info;
export default OddOneOutPlugin;

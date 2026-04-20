/**
 * @title stop-experiment
 * @description Behavioral experiment 
 * @author Team 
 * @version 0.1
 *
 * @assets assets/
 */

/**
 * experiment.js
 * 
 * Main jsPsych experiment file for experiment.
 * 
 * What this file does:
 *  1. Loads the pre-generated trials.json
 *  2. Lets you configure target-present prevalence and how many trials per participant
 *  3. Randomises trial order
 *  4. Runs intro → fullscreen → practice → main trials
 * 
 * Prerequisites:
 *  - Run `node generate_trials.js` first to produce trials.json
 *  - trials.json and the stimuli/ folder must be served statically
 *    (if using jspsych-builder, put trials.json in the `public/` folder)
 */

import { initJsPsych }           from "jspsych";
import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import FullscreenPlugin           from "@jspsych/plugin-fullscreen";
import PreloadPlugin              from "@jspsych/plugin-preload";
import instructions               from "@jspsych/plugin-instructions";
import OddOneOutPlugin            from "./jspsych-odd-one-out.js";

// ─── EXPERIMENT CONFIGURATION ─────────────────────────────────────────────────

const CONFIG = {
  // Path to the master stimuli folder (relative to where the experiment is served)
  stimuli_base: "stimuli/",

  // How many trials to include per participant total
  // Set to null to use ALL available trials
  trials_per_participant: 40,

  // Target-present prevalence: proportion of trials that should have an odd image.
  // 0.5 = half present, half absent. 1.0 = all present. 0.0 = all absent.
  // The script will try to match this ratio from available trials; if there aren't
  // enough of one type it will warn and use what's available.
  target_present_prevalence: 0.5,

  // Whether to show a practice trial before the main block
  show_practice: true,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Select trials for this participant according to CONFIG.
 * Returns a shuffled array of trial objects.
 */
function selectTrials(allTrials) {
  const presentTrials = allTrials.filter(t => t.target_present);
  const absentTrials  = allTrials.filter(t => !t.target_present);

  const n = CONFIG.trials_per_participant ?? allTrials.length;
  const nPresent = Math.round(n * CONFIG.target_present_prevalence);
  const nAbsent  = n - nPresent;

  if (nPresent > presentTrials.length) {
    console.warn(
      `Requested ${nPresent} target-present trials but only ` +
      `${presentTrials.length} are available. Using all available.`
    );
  }
  if (nAbsent > absentTrials.length) {
    console.warn(
      `Requested ${nAbsent} target-absent trials but only ` +
      `${absentTrials.length} are available. Using all available.`
    );
  }

  const chosen = [
    ...shuffle(presentTrials).slice(0, nPresent),
    ...shuffle(absentTrials).slice(0, nAbsent),
  ];

  return shuffle(chosen);
}

/** Fisher-Yates shuffle — returns a NEW array */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Convert a trial object from trials.json into a jsPsych trial object
 * for OddOneOutPlugin.
 */
function makeTrial(trialData) {
  return {
    type:           OddOneOutPlugin,
    category:       trialData.category,
    images:         trialData.images,
    base_path:      CONFIG.stimuli_base + trialData.presence_folder + "/" + trialData.category + "/",
    target_present: trialData.target_present,
    odd_file:       trialData.odd_file,
    data: {
      // Extra metadata stored alongside plugin's own data output
      trial_id: trialData.id,
    },
  };
}

// ─── RUN ──────────────────────────────────────────────────────────────────────

export async function run() {
  console.log("EXPERIMENT RUNNING");
  console.log("run() called");

  // ── Load trials ────────────────────────────────────────────────────────────
  const response = await fetch("stimuli/trials.json")
  const allTrials = await response.json();

  const participantTrials = selectTrials(allTrials);

  // ── Collect all image paths for preloading ─────────────────────────────────
  const allImagePaths = participantTrials.flatMap(t =>
    t.images.map(img =>
      CONFIG.stimuli_base +
      t.presence_folder + "/" +
      t.category + "/" +
      img.file
    )
  );

  // ── Init jsPsych ──────────────────────────────────────────────────────────
  const jsPsych = initJsPsych({
    on_finish: () => {
      // Download data as CSV when experiment ends
      jsPsych.data.get().localSave("csv", "odd_one_out_data.csv");
    },
  });

  const timeline = [];

  // ── Intro ─────────────────────────────────────────────────────────────────
  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="max-width:640px;margin:auto;font-family:system-ui,sans-serif;padding:2rem;text-align:center">
        <h2>Welcome</h2>
        <p>Thank you for your participation. Please read all instructions carefully.</p>
        <p>Press <strong>Space</strong> to begin.</p>
      </div>`,
    choices: [" "],
  });

  timeline.push({
    type: instructions,
    pages: [
      `<div style="max-width:640px;margin:auto;font-family:system-ui,sans-serif;padding:2rem;text-align:center">
        <h3>Task Instructions</h3>
        <p>On each screen you will see <strong>16 images</strong> and a category label at the top.</p>
        <p>Your job: decide whether <em>all</em> images belong to that category, or whether one does not fit.</p>
        <ul style="text-align:left;display:inline-block;line-height:2">
          <li>If <strong>one image does not fit</strong>, click on it.</li>
          <li>If <strong>all images fit</strong>, click the <em>"All fit the category"</em> button at the bottom.</li>
        </ul>
        <p>After clicking, a <strong>Confirm</strong> button will appear. Click it when you are ready to move on.</p>
        <p>You can change your selection before confirming.</p>
      </div>`,
    ],
    show_clickable_nav: true,
    button_label_finish: "Continue →",
  });

  // ── Fullscreen ────────────────────────────────────────────────────────────
  timeline.push({
    type: FullscreenPlugin,
    fullscreen_mode: true,
  });

  // ── Preload ───────────────────────────────────────────────────────────────
  timeline.push({
    type: PreloadPlugin,
    images: allImagePaths,
  });

  // ── Optional practice trial ────────────────────────────────────────────────
  if (CONFIG.show_practice && allTrials.length > 0) {
    // Use the first available trial as practice (not drawn from participant pool)
    const practiceSource = allTrials[0];

    timeline.push({
      type: HtmlKeyboardResponsePlugin,
      stimulus: `
        <div style="max-width:640px;margin:auto;font-family:system-ui,sans-serif;padding:2rem;text-align:center">
          <h3>Practice Trial</h3>
          <p>Let's try one practice round before the real experiment begins.</p>
          <p>Press <strong>Space</strong> to start.</p>
        </div>`,
      choices: [" "],
    });

    timeline.push({
      ...makeTrial(practiceSource),
      data: { trial_id: practiceSource.id, is_practice: true },
      on_finish: (data) => {
        // Show brief feedback after practice
        jsPsych.data.addProperties({ practice_complete: true });
      },
    });

    timeline.push({
      type: HtmlKeyboardResponsePlugin,
      stimulus: () => {
        const lastTrial = jsPsych.data.get().last(1).values()[0];
        const msg = lastTrial.correct
          ? `<p style="color:green;font-size:1.4em">✓ Correct!</p>`
          : `<p style="color:#c0392b;font-size:1.4em">✗ Incorrect.</p>`;
        return `
          <div style="max-width:480px;margin:auto;font-family:system-ui,sans-serif;
                      padding:2rem;text-align:center">
            ${msg}
            <p>The main experiment will now begin.</p>
            <p>Press <strong>Space</strong> to continue.</p>
          </div>`;
      },
      choices: [" "],
    });
  }

  // ── Main block header ─────────────────────────────────────────────────────
  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="max-width:480px;margin:auto;font-family:system-ui,sans-serif;
                  padding:2rem;text-align:center">
        <h3>Main Experiment</h3>
        <p>You will now complete <strong>${participantTrials.length}</strong> trials.</p>
        <p>Remember: click the odd image, or "All fit" if nothing is out of place.</p>
        <p>Press <strong>Space</strong> to begin.</p>
      </div>`,
    choices: [" "],
  });

  // ── Main trials ───────────────────────────────────────────────────────────
  participantTrials.forEach(trialData => {
    timeline.push(makeTrial(trialData));
  });

  // ── End screen ────────────────────────────────────────────────────────────
  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: `
      <div style="max-width:480px;margin:auto;font-family:system-ui,sans-serif;
                  padding:2rem;text-align:center">
        <h3>All done!</h3>
        <p>Thank you for participating. Your data is being saved.</p>
        <p>Press <strong>Space</strong> to finish.</p>
      </div>`,
    choices: [" "],
  });

  await jsPsych.run(timeline);
  return jsPsych;
}

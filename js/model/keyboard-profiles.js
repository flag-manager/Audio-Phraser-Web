/**
 * Yamaha Audio Phraser - Keyboard Profiles & Playability Constraints
 * Defines target Yamaha Arranger Keyboard specifications, expansion memory limits,
 * loading protocols (Direct USB vs YEM Pack), and style size limits.
 */

export const YAMAHA_KEYBOARDS = [
  // 1. Tyros Series (2013 · Previous Flagship Workstation)
  {
    id: 'tyros5',
    name: 'Yamaha Tyros 5',
    shortName: 'Tyros 5',
    category: 'Legacy Flagship Arranger Workstation',
    releaseYear: 2013,
    maxStyleSizeBytes: 32 * 1024 * 1024,
    warnStyleSizeBytes: 24 * 1024 * 1024,
    totalExpansionMemory: 'Up to 2 GB (via FL1024M / FL512M boards)',
    directUsbPlayback: false,
    loadingMethod: 'Yamaha Expansion Manager (YEM) Pack with Flash Board',
    description: 'Requires optional Flash Memory expansion board and YEM pack installation.'
  },
  // 2. PSR-S Series (2015 · Upper-Mid Arranger)
  {
    id: 'psr_s970',
    name: 'Yamaha PSR-S970',
    shortName: 'PSR-S970',
    category: 'Arranger Workstation',
    releaseYear: 2015,
    maxStyleSizeBytes: 18 * 1024 * 1024,   // 18 MB maximum playable individual style size
    warnStyleSizeBytes: 14 * 1024 * 1024,  // 14 MB warning threshold
    totalExpansionMemory: '128 MB Audio Style Expansion Pool',
    directUsbPlayback: false,
    loadingMethod: 'Yamaha Expansion Manager (YEM) Pack via USB',
    description: 'Requires Yamaha Expansion Manager (YEM) to install pack. Individual styles over 18 MB fail with "Data not loaded properly".'
  },
  // 3. PSR-S Series (2018 · Upper-Mid Arranger Upgrade)
  {
    id: 'psr_s975',
    name: 'Yamaha PSR-S975',
    shortName: 'PSR-S975',
    category: 'Arranger Workstation',
    releaseYear: 2018,
    maxStyleSizeBytes: 25 * 1024 * 1024,
    warnStyleSizeBytes: 20 * 1024 * 1024,
    totalExpansionMemory: '768 MB Flash Memory',
    directUsbPlayback: false,
    loadingMethod: 'Yamaha Expansion Manager (YEM) Pack via USB',
    description: 'Requires YEM Pack installation. Recommended max individual style size is 25 MB.'
  },
  // 4. PSR-SX Series (2019/2024 · Mid-Tier Arranger Workstation)
  {
    id: 'psr_sx720',
    name: 'Yamaha PSR-SX720 / SX700',
    shortName: 'PSR-SX720/700',
    category: 'Mid-Tier Arranger Workstation',
    releaseYear: 2019,
    maxStyleSizeBytes: 40 * 1024 * 1024,
    warnStyleSizeBytes: 30 * 1024 * 1024,
    totalExpansionMemory: '1 GB / 400 MB Flash Memory',
    directUsbPlayback: true,
    loadingMethod: 'Direct USB (.aus) or YEM Expansion Pack',
    description: 'Supports direct USB playback of .aus files.'
  },
  // 5. PSR-SX Series (2019 · High-Tier Arranger Workstation)
  {
    id: 'psr_sx900',
    name: 'Yamaha PSR-SX900',
    shortName: 'PSR-SX900',
    category: 'Arranger Workstation',
    releaseYear: 2019,
    maxStyleSizeBytes: 50 * 1024 * 1024,
    warnStyleSizeBytes: 38 * 1024 * 1024,
    totalExpansionMemory: '1 GB Flash Memory',
    directUsbPlayback: true,
    loadingMethod: 'Direct USB (.aus) or YEM Expansion Pack',
    description: 'Supports direct USB playback of .aus files and up to 1 GB Expansion Memory.'
  },
  // 6. PSR-SX Series (2024 · Flagship Arranger Workstation)
  {
    id: 'psr_sx920',
    name: 'Yamaha PSR-SX920',
    shortName: 'PSR-SX920',
    category: 'Flagship Arranger Workstation',
    releaseYear: 2024,
    maxStyleSizeBytes: 64 * 1024 * 1024,   // 64 MB maximum safe individual style size
    warnStyleSizeBytes: 48 * 1024 * 1024,  // 48 MB warning threshold
    totalExpansionMemory: '2 GB Flash Memory',
    directUsbPlayback: true,
    loadingMethod: 'Direct USB (.aus) or YEM Expansion Pack',
    description: 'Supports direct USB playback of .aus files and up to 2 GB Expansion Memory.',
    isDefault: true
  },
  // 7. Premier Flagship Series (2017/2023 · Top Flagship Digital Workstation)
  {
    id: 'genos2',
    name: 'Yamaha Genos / Genos 2',
    shortName: 'Genos 1/2',
    category: 'Premier Flagship Workstation',
    releaseYear: 2023,
    maxStyleSizeBytes: 128 * 1024 * 1024,
    warnStyleSizeBytes: 96 * 1024 * 1024,
    totalExpansionMemory: '3 GB+ Flash Memory',
    directUsbPlayback: true,
    loadingMethod: 'Direct USB (.aus) or YEM Expansion Pack',
    description: 'Flagship arranger with massive expansion memory and direct USB playback.'
  }
];

export class KeyboardManager {
  static getProfile(id) {
    if (!id) {
      return YAMAHA_KEYBOARDS.find(k => k.isDefault) || YAMAHA_KEYBOARDS[0];
    }
    const found = YAMAHA_KEYBOARDS.find(k => k.id === id);
    return found || YAMAHA_KEYBOARDS.find(k => k.isDefault) || YAMAHA_KEYBOARDS[0];
  }

  static getAllProfiles() {
    return [...YAMAHA_KEYBOARDS];
  }

  /**
   * Calculate total estimated size of exported .aus style file in bytes.
   * Based on active sections, their trimmed durations, sample rate (44.1kHz),
   * stereo 16-bit PCM (176,400 bytes/sec) plus Yamaha SFF2 / CASM / AASM / AWav headers.
   *
   * @param {AudioPhraserProject} project
   * @param {number} emptyStySize - Size of Empty.sty base (defaults to 13 KB)
   * @returns {{ totalBytes: number, totalMB: number, sectionBreakdown: Array<{ id: string, name: string, duration: number, bytes: number, mb: number }> }}
   */
  static estimateStyleSize(project, emptyStySize = 13500) {
    if (!project || !project.sections) {
      return { totalBytes: emptyStySize, totalMB: emptyStySize / (1024 * 1024), sectionBreakdown: [] };
    }

    const BASE_HEADERS_SIZE = emptyStySize + 512; // Base Empty.sty + AASM/ASEG headers
    let audioBytesTotal = 0;
    const sectionBreakdown = [];

    for (const sec of project.sections.values()) {
      if (!sec.hasAudio || sec.trimmedDuration <= 0.05) continue;

      const dur = sec.trimmedDuration;
      // 44100 samples/sec * 2 channels * 2 bytes/sample = 176,400 bytes/sec
      const pcmBytes = Math.floor(dur * 44100) * 4;
      const wavHeaderBytes = 44;
      const beatPointsCount = (sec.beatPoints && sec.beatPoints.length > 0)
        ? sec.beatPoints.length
        : (sec.bars * (sec.timeSignature?.numerator || 4) + 1);
      const metadataChunks = 16 + 12 + (8 + beatPointsCount * 4); // StNm + ATmp + BPnt

      const sectionTotal = pcmBytes + wavHeaderBytes + metadataChunks + 16; // 16 bytes for AMix entry
      audioBytesTotal += sectionTotal;

      sectionBreakdown.push({
        id: sec.id,
        name: sec.name,
        code: sec.code,
        category: sec.category,
        duration: dur,
        bars: sec.bars,
        bytes: sectionTotal,
        mb: sectionTotal / (1024 * 1024)
      });
    }

    const totalBytes = BASE_HEADERS_SIZE + audioBytesTotal;
    return {
      totalBytes,
      totalMB: totalBytes / (1024 * 1024),
      sectionBreakdown
    };
  }

  /**
   * Validate style export against a specific keyboard model's limits.
   *
   * @param {AudioPhraserProject} project
   * @param {string} keyboardId - Target keyboard ID (e.g. 'psr_s970', 'psr_sx920')
   * @param {number} emptyStySize - Size of Empty.sty
   * @returns {object} Validation result with playability status, limits, and advice.
   */
  static validateExport(project, keyboardId = 'psr_sx920', emptyStySize = 13500) {
    const keyboard = this.getProfile(keyboardId);
    const sizeInfo = this.estimateStyleSize(project, emptyStySize);

    const estBytes = sizeInfo.totalBytes;
    const estMB = sizeInfo.totalMB;
    const maxMB = keyboard.maxStyleSizeBytes / (1024 * 1024);
    const warnMB = keyboard.warnStyleSizeBytes / (1024 * 1024);
    const percentOfLimit = Math.round((estBytes / keyboard.maxStyleSizeBytes) * 100);

    const isBlocked = estBytes > keyboard.maxStyleSizeBytes;
    const isWarning = !isBlocked && estBytes > keyboard.warnStyleSizeBytes;
    const isSafe = !isBlocked && !isWarning;

    const reasons = [];
    const suggestions = [];

    if (isBlocked) {
      reasons.push(
        `Total style size (${estMB.toFixed(1)} MB) exceeds the ${maxMB.toFixed(0)} MB playability limit for ${keyboard.name}.`
      );
      if (keyboard.id === 'psr_s970') {
        reasons.push(
          'On the PSR-S970, styles over 18 MB will trigger "Data not loaded properly" errors or cause the instrument to freeze during section switching.'
        );
        suggestions.push(
          'Switch target keyboard to Yamaha PSR-SX920 (which supports up to 64 MB direct USB playback).'
        );
      } else {
        reasons.push(
          `Hardware audio playback buffer on ${keyboard.name} cannot safely cache this style in RAM without playback stutter or loading failure.`
        );
      }
      suggestions.push('Trim section loop durations using the waveform editor.');
      suggestions.push('Reduce section bar counts or unlink unnecessary audio variations.');
    } else if (isWarning) {
      reasons.push(
        `Style size (${estMB.toFixed(1)} MB) is approaching the ${maxMB.toFixed(0)} MB ceiling for ${keyboard.name}.`
      );
      if (keyboard.id === 'psr_s970') {
        reasons.push(
          'Loading times in Yamaha Expansion Manager (YEM) will be slower. Ensure sufficient Expansion Audio memory is available on the keyboard.'
        );
      }
    }

    // Additional Yamaha Section Bar limits check
    const barViolations = [];
    for (const sec of project.sections.values()) {
      if (!sec.hasAudio) continue;
      if (['fill', 'break'].includes(sec.category.toLowerCase()) && sec.bars > 1) {
        barViolations.push(`${sec.name} has ${sec.bars} bars (Yamaha Audio Phraser standard is 1 bar for Fills & Break).`);
      }
      if (sec.bars > 32) {
        barViolations.push(`${sec.name} has ${sec.bars} bars (maximum allowed is 32 bars).`);
      }
    }

    return {
      valid: !isBlocked,
      isBlocked,
      isWarning,
      isSafe,
      keyboard,
      estimatedBytes: estBytes,
      estimatedMB: estMB,
      maxMB,
      warnMB,
      percentOfLimit,
      sectionBreakdown: sizeInfo.sectionBreakdown,
      reasons,
      suggestions,
      barViolations,
      message: isBlocked
        ? `Export Blocked: Size exceeds ${keyboard.name} limit (${estMB.toFixed(1)} MB / ${maxMB.toFixed(0)} MB).`
        : isWarning
          ? `Warning: Approaching ${keyboard.name} size limit (${estMB.toFixed(1)} MB / ${maxMB.toFixed(0)} MB).`
          : `Ready for ${keyboard.name} (${estMB.toFixed(1)} MB / ${maxMB.toFixed(0)} MB - ${percentOfLimit}%).`
    };
  }
}

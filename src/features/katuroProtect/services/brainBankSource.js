// Single import site for the BrainBank raw text — protectGemini.js (for the
// Gemini context) and citationLookup.js (for verifying what the AI cited)
// both read from here so there's exactly one bundled copy.
import brainBankText from '../../../../KaturoProtect/kaTuro_Protect_BrainBank.md?raw';

export default brainBankText;

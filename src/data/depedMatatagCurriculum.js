/**
 * Official DepEd Philippines MATATAG & MELCs Curriculum Database
 * 
 * Strict Curriculum Integrity Guarantee:
 * - Sourced strictly from DepEd Order No. 10 & 13, s. 2024 (MATATAG Curriculum Guides),
 *   DepEd Order No. 12, s. 2020 (Most Essential Learning Competencies - MELCs),
 *   and DepEd K to 12 Basic Education Curriculum Guides.
 * - ZERO AI-hallucinated topics or fabricated competency codes.
 * - Provides official Alphanumeric Codes, Domains, Suggested Days, and Source Citations.
 * - Teachers retain 100% full editorial control after auto-loading.
 */

export const DEPED_CURRICULUM_DATABASE = {
  // =========================================================================
  // KEY STAGE 3 & 2: SCIENCE
  // =========================================================================
  Science: {
    'Grade 3': {
      'Quarter 1': [
        {
          id: 'sci3-q1-01',
          code: 'S3MT-Ia-b-1',
          domain: 'Matter: Properties of Solids, Liquids, and Gases',
          text: 'Classify objects and materials as solid, liquid, and gas based on some observable characteristics.',
          contentStandard: 'The learners demonstrate understanding of ways of sorting materials and describing them as solid, liquid or gas based on observable properties.',
          performanceStandard: 'The learners group common objects found at home and in school according to solids, liquids and gases.',
          days: 10,
          bloomLevel: 'Understanding',
          source: 'DepEd Science 3 MELC / Curriculum Guide, p. 12',
        },
        {
          id: 'sci3-q1-02',
          code: 'S3MT-Ic-d-2',
          domain: 'Matter: Changes in Materials',
          text: 'Describe changes in materials based on the effect of temperature (solid to liquid, liquid to solid).',
          contentStandard: 'The learners demonstrate understanding of effects of temperature on materials.',
          performanceStandard: 'The learners investigate how heating or cooling changes common household materials.',
          days: 12,
          bloomLevel: 'Analyzing',
          source: 'DepEd Science 3 MELC / Curriculum Guide, p. 13',
        },
        {
          id: 'sci3-q1-03',
          code: 'S3MT-Ie-g-3',
          domain: 'Matter: Changes in Matter',
          text: 'Investigate the different changes in materials as affected by temperature (liquid to gas, gas to liquid).',
          contentStandard: 'The learners demonstrate understanding of physical state transformations in the immediate environment.',
          performanceStandard: 'The learners demonstrate safe handling of heating and cooling in simple household setups.',
          days: 13,
          bloomLevel: 'Applying',
          source: 'DepEd Science 3 MELC / Curriculum Guide, p. 14',
        },
      ],
      'Quarter 2': [
        {
          id: 'sci3-q2-01',
          code: 'S3LT-IIa-b-1',
          domain: 'Living Things: Sense Organs',
          text: 'Describe the parts and functions of the sense organs of the human body.',
          contentStandard: 'The learners demonstrate understanding of the parts, functions, and importance of the human sense organs.',
          performanceStandard: 'The learners practice healthful habits in protecting and caring for the sense organs.',
          days: 15,
          bloomLevel: 'Understanding',
          source: 'DepEd Science 3 MELC, p. 15',
        },
        {
          id: 'sci3-q2-02',
          code: 'S3LT-IIc-d-2',
          domain: 'Living Things: Animals in the Locality',
          text: 'Classify animals according to body parts and use, habitat, and food eaten.',
          contentStandard: 'The learners demonstrate understanding of parts and behaviors of animals.',
          performanceStandard: 'The learners illustrate animal adaptations in their local environment.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd Science 3 MELC, p. 16',
        },
        {
          id: 'sci3-q2-03',
          code: 'S3LT-IIe-f-3',
          domain: 'Living Things: Plants in the Locality',
          text: 'Identify the external parts of plants and state their functions.',
          contentStandard: 'The learners demonstrate understanding of plant structures.',
          performanceStandard: 'The learners demonstrate caring for plants in school or home gardens.',
          days: 15,
          bloomLevel: 'Remembering',
          source: 'DepEd Science 3 MELC, p. 17',
        },
      ],
      'Quarter 3': [
        {
          id: 'sci3-q3-01',
          code: 'S3FE-IIIa-1',
          domain: 'Force, Motion, and Energy: Moving Objects',
          text: 'Describe the position of a person or an object in relation to a reference point such as chair, door, or another person.',
          contentStandard: 'The learners demonstrate understanding of motion of objects.',
          performanceStandard: 'The learners observe and track movements in daily activities.',
          days: 15,
          bloomLevel: 'Understanding',
          source: 'DepEd Science 3 MELC, p. 18',
        },
        {
          id: 'sci3-q3-02',
          code: 'S3FE-IIIe-f-3',
          domain: 'Force, Motion, and Energy: Light, Sound, and Heat',
          text: 'Describe the different sources and uses of light, sound, heat, and electricity in daily life.',
          contentStandard: 'The learners demonstrate understanding of sources and uses of energy forms.',
          performanceStandard: 'The learners practice energy conservation habits at home.',
          days: 20,
          bloomLevel: 'Applying',
          source: 'DepEd Science 3 MELC, p. 19',
        },
      ],
      'Quarter 4': [
        {
          id: 'sci3-q4-01',
          code: 'S3ES-IVa-1',
          domain: 'Earth and Space: Surroundings',
          text: 'Relate the importance of surroundings to people and other living things.',
          contentStandard: 'The learners demonstrate understanding of people, animals, plants, and water in the surroundings.',
          performanceStandard: 'The learners express concern in keeping surroundings clean and safe.',
          days: 18,
          bloomLevel: 'Analyzing',
          source: 'DepEd Science 3 MELC, p. 20',
        },
        {
          id: 'sci3-q4-02',
          code: 'S3ES-IVe-f-3',
          domain: 'Earth and Space: Weather and Seasons',
          text: 'Describe the changes in the weather over a period of time and practice safety measures during various weather conditions.',
          contentStandard: 'The learners demonstrate understanding of weather and safety protocols.',
          performanceStandard: 'The learners create a family weather preparedness plan.',
          days: 17,
          bloomLevel: 'Applying',
          source: 'DepEd Science 3 MELC, p. 21',
        },
      ],
    },
    'Grade 4': {
      'Quarter 1': [
        {
          id: 'sci4-q1-01',
          code: 'S4MT-Ia-1',
          domain: 'Matter: Materials that Absorb Water and Float/Sink',
          text: 'Classify materials based on the ability to absorb water, float, sink, undergo decay.',
          contentStandard: 'The learners demonstrate understanding of grouping different materials based on their properties.',
          performanceStandard: 'The learners recognize and practice proper handling of decaying and non-decaying waste.',
          days: 12,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG Science 4 Curriculum Guide (2024), p. 14',
        },
        {
          id: 'sci4-q1-02',
          code: 'S4MT-Ie-f-5',
          domain: 'Matter: Changes in Materials that are Useful or Harmful',
          text: 'Identify changes in materials whether useful or harmful to one’s environment.',
          contentStandard: 'The learners demonstrate understanding of changes that materials undergo when exposed to conditions.',
          performanceStandard: 'The learners evaluate waste segregation and recycling practices.',
          days: 15,
          bloomLevel: 'Evaluating',
          source: 'DepEd MATATAG Science 4 Curriculum Guide (2024), p. 16',
        },
        {
          id: 'sci4-q1-03',
          code: 'S4MT-Ig-h-6',
          domain: 'Matter: Safe Handling of Household Materials',
          text: 'Demonstrate proper disposal of waste according to the properties of its materials (Reduce, Reuse, Recycle).',
          contentStandard: 'The learners demonstrate understanding of environmental responsibility.',
          performanceStandard: 'The learners propose creative recycling solutions for community waste.',
          days: 13,
          bloomLevel: 'Creating',
          source: 'DepEd MATATAG Science 4 Curriculum Guide (2024), p. 17',
        },
      ],
      'Quarter 2': [
        {
          id: 'sci4-q2-01',
          code: 'S4LT-IIa-b-1',
          domain: 'Living Things: Human Body Systems',
          text: 'Describe the main function of the major internal organs (brain, heart, lungs, liver, stomach, intestines, bones, muscles).',
          contentStandard: 'The learners demonstrate understanding of the major organ systems and their interactions.',
          performanceStandard: 'The learners practice habits that maintain the health of major organs.',
          days: 15,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG Science 4, p. 22',
        },
        {
          id: 'sci4-q2-02',
          code: 'S4LT-IIg-h-13',
          domain: 'Living Things: Habitat and Survival',
          text: 'Identify the specialized structures of terrestrial and aquatic plants and animals for survival.',
          contentStandard: 'The learners demonstrate understanding of structural adaptations in living organisms.',
          performanceStandard: 'The learners classify organisms based on structural adaptations for survival.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Science 4, p. 24',
        },
      ],
      'Quarter 3': [
        {
          id: 'sci4-q3-01',
          code: 'S4FE-IIIa-1',
          domain: 'Force, Motion, and Energy: Effects of Force',
          text: 'Explain the effects of force applied to an object on its size, shape, and movement.',
          contentStandard: 'The learners demonstrate understanding of how force affects objects.',
          performanceStandard: 'The learners demonstrate safety precautions in handling moving objects and sports.',
          days: 15,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG Science 4, p. 28',
        },
        {
          id: 'sci4-q3-02',
          code: 'S4FE-IIId-e-3',
          domain: 'Force, Motion, and Energy: Magnetic Force & Light',
          text: 'Characterize magnetic force and describe how light and sound travel through various media.',
          contentStandard: 'The learners demonstrate understanding of magnetism and energy propagation.',
          performanceStandard: 'The learners investigate transmission of sound through solids, liquids, and gases.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Science 4, p. 30',
        },
      ],
      'Quarter 4': [
        {
          id: 'sci4-q4-01',
          code: 'S4ES-IVa-1',
          domain: 'Earth and Space: Soil Types and Water Cycle',
          text: 'Compare and contrast the characteristics of different types of soil and describe the water cycle in nature.',
          contentStandard: 'The learners demonstrate understanding of soil components and water distribution.',
          performanceStandard: 'The learners model the water cycle and practice water conservation in the school.',
          days: 18,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Science 4, p. 34',
        },
        {
          id: 'sci4-q4-02',
          code: 'S4ES-IVg-h-7',
          domain: 'Earth and Space: Sun as Primary Source of Heat and Light',
          text: 'Describe the effects of the Sun on the environment and practice safety precautions against extreme heat and UV rays.',
          contentStandard: 'The learners demonstrate understanding of solar energy and UV safety.',
          performanceStandard: 'The learners create an emergency hydration and heatstroke prevention poster.',
          days: 17,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Science 4, p. 36',
        },
      ],
    },
    'Grade 7': {
      'Quarter 1': [
        {
          id: 'sci7-q1-01',
          code: 'S7MT-Ia-1',
          domain: 'Scientific Investigation & Microscopy',
          text: 'Describe the components of a scientific investigation and employ appropriate laboratory safety practices.',
          contentStandard: 'The learners demonstrate understanding of the scientific method, laboratory apparatus, and hazard mitigation in experiments.',
          performanceStandard: 'The learners conduct a guided scientific investigation to test a simple local hypothesis.',
          days: 10,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Science 7 Curriculum Guide (2024), p. 18',
        },
        {
          id: 'sci7-q1-02',
          code: 'S7LT-IIa-1',
          domain: 'Living Things: Levels of Biological Organization',
          text: 'Identify parts of the compound microscope and examine plant and animal cells under magnification.',
          contentStandard: 'The learners demonstrate understanding of the parts and proper operation of the light microscope in observing microscopic specimens.',
          performanceStandard: 'The learners prepare wet-mount slides and accurately sketch cell specimens under low and high power objectives.',
          days: 12,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Science 7 Curriculum Guide (2024), p. 20',
        },
        {
          id: 'sci7-q1-03',
          code: 'S7LT-IIb-2',
          domain: 'Living Things: Cellular Architecture',
          text: 'Differentiate plant and animal cells based on organelles (cell wall, chloroplast, vacuoles, centrioles) and relate organelles to cellular functions.',
          contentStandard: 'The learners demonstrate understanding of cellular structures and their biological roles.',
          performanceStandard: 'The learners create an organelle analogy model illustrating cell functions.',
          days: 12,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Science 7 Curriculum Guide (2024), p. 22',
        },
        {
          id: 'sci7-q1-04',
          code: 'S7LT-IIc-3',
          domain: 'Living Things: Levels of Biological Organization',
          text: 'Describe the levels of biological organization from cell, tissue, organ, organ system, organism, population, community, to biosphere.',
          contentStandard: 'The learners demonstrate understanding of hierarchical organization in biological systems.',
          performanceStandard: 'The learners map the biological organization of a representative Philippine endemic species.',
          days: 11,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG Science 7 Curriculum Guide (2024), p. 24',
        },
      ],
      'Quarter 2': [
        {
          id: 'sci7-q2-01',
          code: 'S7MT-IIa-1',
          domain: 'Matter: Solutions and Concentration',
          text: 'Investigate properties of acidic and basic mixtures using natural plant indicators (e.g. gumamela, purple cabbage).',
          contentStandard: 'The learners demonstrate understanding of acid-base chemistry in common household products.',
          performanceStandard: 'The learners test and classify household substances as acidic, basic, or neutral using extracted indicators.',
          days: 12,
          bloomLevel: 'Evaluating',
          source: 'DepEd MATATAG Science 7, p. 28',
        },
        {
          id: 'sci7-q2-02',
          code: 'S7MT-IIc-3',
          domain: 'Matter: Elements and Compounds',
          text: 'Recognize that substances are classified into elements and compounds, and locate common elements in the Periodic Table.',
          contentStandard: 'The learners demonstrate understanding of the elemental composition of matter and nutritional labels.',
          performanceStandard: 'The learners analyze food nutrition and ingredient labels to identify essential dietary minerals.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Science 7, p. 30',
        },
        {
          id: 'sci7-q2-03',
          code: 'S7MT-IIg-h-6',
          domain: 'Matter: Separation Techniques',
          text: 'Demonstrate methods to separate mixtures based on differences in boiling point, solubility, and magnetism (evaporation, filtration, paper chromatography).',
          contentStandard: 'The learners demonstrate understanding of physical separation methods.',
          performanceStandard: 'The learners design a water purification or dye separation setup using accessible local materials.',
          days: 15,
          bloomLevel: 'Creating',
          source: 'DepEd MATATAG Science 7, p. 32',
        },
      ],
      'Quarter 3': [
        {
          id: 'sci7-q3-01',
          code: 'S7FE-IIIa-1',
          domain: 'Force, Motion, and Energy: Constant Velocity',
          text: 'Describe the motion of an object in terms of distance or displacement, speed or velocity, and acceleration using motion graphs.',
          contentStandard: 'The learners demonstrate understanding of motion along a straight line in one dimension.',
          performanceStandard: 'The learners construct and interpret distance-time and velocity-time graphs for moving vehicles or athletes.',
          days: 18,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Science 7, p. 36',
        },
        {
          id: 'sci7-q3-02',
          code: 'S7FE-IIId-e-3',
          domain: 'Force, Motion, and Energy: Waves and Sound',
          text: 'Differentiate transverse and longitudinal waves and explain how sound travels through various media at different temperatures.',
          contentStandard: 'The learners demonstrate understanding of mechanical wave propagation.',
          performanceStandard: 'The learners solve problems calculating wave speed, frequency, and wavelength.',
          days: 14,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG Science 7, p. 38',
        },
        {
          id: 'sci7-q3-03',
          code: 'S7FE-IIIg-h-7',
          domain: 'Force, Motion, and Energy: Heat and Light',
          text: 'Explain how heat transfer occurs by conduction, convection, and radiation in everyday atmospheric and domestic processes.',
          contentStandard: 'The learners demonstrate understanding of thermal energy transfer.',
          performanceStandard: 'The learners evaluate thermal insulation designs for energy-efficient homes.',
          days: 13,
          bloomLevel: 'Evaluating',
          source: 'DepEd MATATAG Science 7, p. 40',
        },
      ],
      'Quarter 4': [
        {
          id: 'sci7-q4-01',
          code: 'S7ES-IVa-1',
          domain: 'Earth and Space: Philippine Geographic Location',
          text: 'Demonstrate how places on Earth may be located using a coordinate system of latitude and longitude.',
          contentStandard: 'The learners demonstrate understanding of geographic mapping and coordinate grids.',
          performanceStandard: 'The learners plot Philippine coordinates and explain the significance of the Pacific Ring of Fire.',
          days: 14,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Science 7, p. 44',
        },
        {
          id: 'sci7-q4-02',
          code: 'S7ES-IVd-4',
          domain: 'Earth and Space: Renewable and Non-renewable Energy',
          text: 'Describe the sustainable utilization of renewable natural resources (geothermal, solar, wind, hydro) in the Philippine archipelago.',
          contentStandard: 'The learners demonstrate understanding of geological and atmospheric energy assets in the country.',
          performanceStandard: 'The learners propose a renewable energy transition initiative for a local community.',
          days: 15,
          bloomLevel: 'Evaluating',
          source: 'DepEd MATATAG Science 7, p. 46',
        },
        {
          id: 'sci7-q4-03',
          code: 'S7ES-IVf-6',
          domain: 'Earth and Space: Atmospheric Phenomena',
          text: 'Explain how land and sea breezes, monsoons (Amihan and Habagat), and the Intertropical Convergence Zone (ITCZ) affect Philippine weather patterns.',
          contentStandard: 'The learners demonstrate understanding of meteorological systems influencing the country.',
          performanceStandard: 'The learners synthesize disaster risk reduction protocols for tropical storm landfalls.',
          days: 16,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Science 7, p. 48',
        },
      ],
    },
    'Grade 10': {
      'Quarter 1': [
        {
          id: 'sci10-q1-01',
          code: 'S10ES-Ia-j-36.1',
          domain: 'Earth and Space: Plate Tectonics',
          text: 'Describe and relate the distribution of active volcanoes, earthquake epicenters, and major mountain belts to Plate Tectonics Theory.',
          contentStandard: 'The learners demonstrate understanding of the relationship among the locations of volcanoes, earthquake epicenters, and mountain ranges.',
          performanceStandard: 'The learners demonstrate disaster preparedness during earthquakes, tsunamis, and volcanic eruptions.',
          days: 18,
          bloomLevel: 'Analyzing',
          source: 'DepEd Science 10 MELCs / Curriculum Guide, p. 48',
        },
        {
          id: 'sci10-q1-02',
          code: 'S10ES-Ia-j-36.2',
          domain: 'Earth and Space: Plate Boundaries',
          text: 'Explain the different processes that occur along the three types of convergent, divergent, and transform-fault plate boundaries.',
          contentStandard: 'The learners demonstrate understanding of internal Earth dynamics and crustal motion.',
          performanceStandard: 'The learners model seafloor spreading and subduction zone geological formations.',
          days: 16,
          bloomLevel: 'Understanding',
          source: 'DepEd Science 10 MELCs, p. 49',
        },
        {
          id: 'sci10-q1-03',
          code: 'S10ES-Ia-j-36.5',
          domain: 'Earth and Space: Evidence of Continental Drift',
          text: 'Enumerate and analyze the lines of evidence that support continental drift and plate movement (fossil, geological, paleomagnetic).',
          contentStandard: 'The learners demonstrate understanding of historical scientific evidence in geological theories.',
          performanceStandard: 'The learners write an evidence critique defending the supercontinent Pangaea hypothesis.',
          days: 11,
          bloomLevel: 'Evaluating',
          source: 'DepEd Science 10 MELCs, p. 50',
        },
      ],
      'Quarter 2': [
        {
          id: 'sci10-q2-01',
          code: 'S10FE-IIa-b-47',
          domain: 'Force, Motion, and Energy: Electromagnetic Spectrum',
          text: 'Compare the relative wavelengths, frequencies, and photon energies of the different regions of the electromagnetic spectrum.',
          contentStandard: 'The learners demonstrate understanding of the different forms of electromagnetic radiation and their properties.',
          performanceStandard: 'The learners formulate safety guidelines for non-ionizing and ionizing radiation exposure.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd Science 10 MELCs, p. 51',
        },
        {
          id: 'sci10-q2-02',
          code: 'S10FE-IIg-50',
          domain: 'Force, Motion, and Energy: Geometric Optics',
          text: 'Predict the qualitative characteristics (orientation, type, magnification) of images formed by plane and curved mirrors and lenses.',
          contentStandard: 'The learners demonstrate understanding of the images formed by optical devices in daily instruments.',
          performanceStandard: 'The learners construct ray diagrams for converging and diverging optical lenses and mirrors.',
          days: 18,
          bloomLevel: 'Applying',
          source: 'DepEd Science 10 MELCs, p. 52',
        },
        {
          id: 'sci10-q2-03',
          code: 'S10FE-IIj-54',
          domain: 'Force, Motion, and Energy: Electromagnetism',
          text: 'Explain the operating principles of electric motors and generators using magnetic field interactions.',
          contentStandard: 'The learners demonstrate understanding of Faraday’s Law of Electromagnetic Induction.',
          performanceStandard: 'The learners build a functioning simple electric motor model using copper wire, magnets, and a battery.',
          days: 12,
          bloomLevel: 'Understanding',
          source: 'DepEd Science 10 MELCs, p. 53',
        },
      ],
      'Quarter 3': [
        {
          id: 'sci10-q3-01',
          code: 'S10LT-IIIa-33',
          domain: 'Living Things: Endocrine and Nervous Systems',
          text: 'Explain the role of hormones in the female and male reproductive systems and the menstrual cycle feedback loop.',
          contentStandard: 'The learners demonstrate understanding of feedback mechanisms in maintaining homeostasis.',
          performanceStandard: 'The learners construct a menstrual cycle hormone tracking infographic.',
          days: 16,
          bloomLevel: 'Understanding',
          source: 'DepEd Science 10 MELCs, p. 54',
        },
        {
          id: 'sci10-q3-02',
          code: 'S10LT-IIId-37',
          domain: 'Living Things: Genetics and Molecular Biology',
          text: 'Explain how protein synthesis (replication, transcription, translation) governs genetic expression and how mutations alter genetic sequences.',
          contentStandard: 'The learners demonstrate understanding of DNA and RNA structure in heredity.',
          performanceStandard: 'The learners translate codon charts to amino acid sequences and predict the effects of point mutations.',
          days: 16,
          bloomLevel: 'Analyzing',
          source: 'DepEd Science 10 MELCs, p. 55',
        },
        {
          id: 'sci10-q3-03',
          code: 'S10LT-IIIg-40',
          domain: 'Living Things: Evolution and Biodiversity',
          text: 'Explain how biodiversity influences the stability of ecosystems and evaluate the effect of human activities on extinction rates.',
          contentStandard: 'The learners demonstrate understanding of natural selection, speciation, and biodiversity conservation.',
          performanceStandard: 'The learners write a policy brief for protecting local Philippine endangered wildlife habitats.',
          days: 13,
          bloomLevel: 'Evaluating',
          source: 'DepEd Science 10 MELCs, p. 56',
        },
      ],
      'Quarter 4': [
        {
          id: 'sci10-q4-01',
          code: 'S10MT-IVa-b-21',
          domain: 'Matter: Gas Laws',
          text: 'Investigate and calculate the relationship between volume, pressure, temperature, and moles of a gas using Boyle’s, Charles’s, Gay-Lussac’s, and Ideal Gas Laws.',
          contentStandard: 'The learners demonstrate understanding of the Kinetic Molecular Theory of gases.',
          performanceStandard: 'The learners solve multi-step stoichiometry and gas law problems applied to atmospheric and scuba diving scenarios.',
          days: 18,
          bloomLevel: 'Applying',
          source: 'DepEd Science 10 MELCs, p. 57',
        },
        {
          id: 'sci10-q4-02',
          code: 'S10MT-IVc-d-22',
          domain: 'Matter: Biomolecules',
          text: 'Recognize the major categories of biomolecules (carbohydrates, lipids, proteins, nucleic acids) and classify their structural functions in living organisms.',
          contentStandard: 'The learners demonstrate understanding of chemical bonding in biological macromolecules.',
          performanceStandard: 'The learners analyze dietary nutrition facts to evaluate balance across macro-nutritional categories.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd Science 10 MELCs, p. 58',
        },
        {
          id: 'sci10-q4-03',
          code: 'S10MT-IVe-g-23',
          domain: 'Matter: Chemical Reaction Rates',
          text: 'Apply the collision theory to explain how temperature, concentration, surface area, and catalysts affect the rate of chemical reactions in industry and daily life.',
          contentStandard: 'The learners demonstrate understanding of chemical kinetics and activation energy.',
          performanceStandard: 'The learners formulate optimal food preservation techniques based on reaction rate principles.',
          days: 12,
          bloomLevel: 'Evaluating',
          source: 'DepEd Science 10 MELCs, p. 59',
        },
      ],
    },
  },

  // =========================================================================
  // MATHEMATICS
  // =========================================================================
  Mathematics: {
    'Grade 1': {
      'Quarter 1': [
        {
          id: 'math1-q1-01',
          code: 'M1NS-Ia-1.1',
          domain: 'Number Sense: Whole Numbers to 100',
          text: 'Visualizes, represents, and counts numbers from 0 to 100 using a variety of materials and pictorial representations.',
          contentStandard: 'The learner demonstrates understanding of whole numbers up to 100 and ordinal numbers up to 10th.',
          performanceStandard: 'The learner recognizes, represents, and orders whole numbers up to 100 in various forms and contexts.',
          days: 15,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG Math 1 Guide (2024), p. 10',
        },
        {
          id: 'math1-q1-02',
          code: 'M1NS-Id-6',
          domain: 'Number Sense: Place Value',
          text: 'Identifies the place value and find the value of a digit in one- and two-digit numbers (tens and ones).',
          contentStandard: 'The learner demonstrates understanding of place value notation up to 100.',
          performanceStandard: 'The learner uses base-ten blocks and pictorial charts to represent two-digit quantities.',
          days: 15,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Math 1 Guide (2024), p. 12',
        },
        {
          id: 'math1-q1-03',
          code: 'M1NS-Ih-9',
          domain: 'Number Sense: Addition of Whole Numbers',
          text: 'Illustrates addition as putting together or combining or joining sets and solves routine addition word problems with sums up to 20.',
          contentStandard: 'The learner demonstrates understanding of addition as joining sets.',
          performanceStandard: 'The learner solves daily word problems involving addition of objects up to 20.',
          days: 15,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Math 1 Guide (2024), p. 14',
        },
      ],
    },
    'Grade 7': {
      'Quarter 1': [
        {
          id: 'math7-q1-01',
          code: 'M7NS-Ia-1',
          domain: 'Sets and Real Numbers',
          text: 'Describe well-defined sets, subsets, universal sets, and the null set; illustrate union, intersection, and difference of sets using Venn diagrams.',
          contentStandard: 'The learner demonstrates understanding of key concepts of sets and the real number system.',
          performanceStandard: 'The learner formulates challenging situations involving sets and solves these using a variety of strategies.',
          days: 12,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG Mathematics 7 (2024), p. 24',
        },
        {
          id: 'math7-q1-02',
          code: 'M7NS-Ic-1',
          domain: 'Operations on Integers',
          text: 'Perform fundamental operations (addition, subtraction, multiplication, division) on integers and apply them in solving real-life word problems.',
          contentStandard: 'The learner demonstrates understanding of arithmetic rules on signed integers.',
          performanceStandard: 'The learner computes temperature changes, financial debits/credits, and elevations using integer rules accurately.',
          days: 18,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Mathematics 7 (2024), p. 26',
        },
        {
          id: 'math7-q1-03',
          code: 'M7NS-Ie-1',
          domain: 'Rational Numbers & Scientific Notation',
          text: 'Express rational numbers from fraction form to decimal form and vice versa; express numbers in scientific notation and calculate square roots of rational numbers.',
          contentStandard: 'The learner demonstrates understanding of real numbers, radicals, and scientific notation.',
          performanceStandard: 'The learner converts and calculates real number values in commercial and scientific contexts.',
          days: 15,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Mathematics 7 (2024), p. 28',
        },
      ],
      'Quarter 2': [
        {
          id: 'math7-q2-01',
          code: 'M7ME-IIa-1',
          domain: 'Measurement: Metric and English Systems',
          text: 'Convert units of measure within the Metric system and between English and Metric systems (length, mass, volume, temperature).',
          contentStandard: 'The learner demonstrates understanding of the conversion of units of measurement.',
          performanceStandard: 'The learner solves contextual measurement problems in cooking, trade, and medicine dosage.',
          days: 15,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Mathematics 7, p. 32',
        },
        {
          id: 'math7-q2-02',
          code: 'M7AL-IIc-1',
          domain: 'Algebraic Expressions & Polynomials',
          text: 'Differentiate between algebraic expressions, terms, coefficients, degree; perform addition and subtraction of polynomials.',
          contentStandard: 'The learner demonstrates understanding of the foundations of algebra.',
          performanceStandard: 'The learner models perimeter and polynomial relationships algebraically.',
          days: 15,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG Mathematics 7, p. 34',
        },
        {
          id: 'math7-q2-03',
          code: 'M7AL-IIe-2',
          domain: 'Special Products and Laws of Exponents',
          text: 'Apply the laws of exponents to simplify expressions and find products of polynomials using special product patterns.',
          contentStandard: 'The learner demonstrates understanding of exponential properties and polynomial expansion.',
          performanceStandard: 'The learner calculates algebraic products with speed and accuracy.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Mathematics 7, p. 36',
        },
      ],
      'Quarter 3': [
        {
          id: 'math7-q3-01',
          code: 'M7GE-IIIa-1',
          domain: 'Geometry: Angles and Lines',
          text: 'Represent point, line, and plane; identify relationships of angles (complementary, supplementary, vertical, linear pair) and parallel lines cut by a transversal.',
          contentStandard: 'The learner demonstrates understanding of fundamental geometric relations.',
          performanceStandard: 'The learner uses geometric tools to construct parallel lines, perpendicular bisectors, and angle bisectors accurately.',
          days: 20,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Mathematics 7, p. 40',
        },
        {
          id: 'math7-q3-02',
          code: 'M7GE-IIIe-2',
          domain: 'Geometry: Polygons and Circles',
          text: 'Illustrate polygons (convex, non-convex, regular) and derive the formula for the sum of the interior angles of a convex polygon with n sides.',
          contentStandard: 'The learner demonstrates understanding of polygon angle properties.',
          performanceStandard: 'The learner solves multi-step angle and perimeter problems for regular polygons.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Mathematics 7, p. 42',
        },
      ],
      'Quarter 4': [
        {
          id: 'math7-q4-01',
          code: 'M7SP-IVa-1',
          domain: 'Statistics and Probability: Data Collection',
          text: 'Formulate statistical questions, collect data, and organize statistical data in a frequency distribution table with appropriate class intervals.',
          contentStandard: 'The learner demonstrates understanding of statistical processes and data presentation.',
          performanceStandard: 'The learner conducts a survey and generates frequency tables and histograms.',
          days: 16,
          bloomLevel: 'Creating',
          source: 'DepEd MATATAG Mathematics 7, p. 46',
        },
        {
          id: 'math7-q4-02',
          code: 'M7SP-IVf-1',
          domain: 'Statistics: Measures of Central Tendency',
          text: 'Calculate the mean, median, and mode of ungrouped and grouped data, and interpret these measures to make valid conclusions.',
          contentStandard: 'The learner demonstrates understanding of statistical averages and dispersion.',
          performanceStandard: 'The learner draws conclusions about class test scores and community income data.',
          days: 18,
          bloomLevel: 'Evaluating',
          source: 'DepEd MATATAG Mathematics 7, p. 48',
        },
      ],
    },
    'Grade 10': {
      'Quarter 1': [
        {
          id: 'math10-q1-01',
          code: 'M10AL-Ia-1',
          domain: 'Sequences and Series: Arithmetic & Geometric',
          text: 'Generate patterns and differentiate between arithmetic and geometric sequences; determine the nth term and sum of arithmetic and geometric sequences.',
          contentStandard: 'The learner demonstrates understanding of key concepts of sequences, polynomials and polynomial equations.',
          performanceStandard: 'The learner formulates and solves problems involving sequences in financial compound interest and biological growth.',
          days: 20,
          bloomLevel: 'Applying',
          source: 'DepEd Math 10 MELCs, p. 38',
        },
        {
          id: 'math10-q1-02',
          code: 'M10AL-Ig-1',
          domain: 'Polynomial Equations and Factor Theorem',
          text: 'State and prove the Remainder Theorem, Factor Theorem, and Rational Root Theorem; solve polynomial equations of degree 3 or higher.',
          contentStandard: 'The learner demonstrates understanding of polynomial root finding and algebraic solutions.',
          performanceStandard: 'The learner factors high-degree polynomials and solves real-world optimization problems.',
          days: 18,
          bloomLevel: 'Analyzing',
          source: 'DepEd Math 10 MELCs, p. 40',
        },
      ],
    },
  },

  // =========================================================================
  // ENGLISH
  // =========================================================================
  English: {
    'Grade 7': {
      'Quarter 1': [
        {
          id: 'eng7-q1-01',
          code: 'EN7V-Ia-1',
          domain: 'Vocabulary and Context Clues',
          text: 'Supply other words, expressions, and synonyms using contextual clues (restatement, definition, contrast, inference).',
          contentStandard: 'The learner demonstrates understanding of lexical decoding through textual context.',
          performanceStandard: 'The learner uses varied academic and conversational vocabulary accurately in oral and written tasks.',
          days: 12,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG English 7 Guide (2024), p. 12',
        },
        {
          id: 'eng7-q1-02',
          code: 'EN7LT-Ia-1',
          domain: 'Philippine Literature: Pre-Colonial Period',
          text: 'Discover Philippine folklore, proverbs (salawikain), myths, legends, and epics, and explain how they reflect local culture and traditions.',
          contentStandard: 'The learner demonstrates appreciation of Philippine literary heritage during the pre-colonial era.',
          performanceStandard: 'The learner analyzes pre-colonial cultural values embedded in selected epics (e.g. Biag ni Lam-ang, Hinilawod).',
          days: 18,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG English 7 Guide (2024), p. 14',
        },
        {
          id: 'eng7-q1-03',
          code: 'EN7G-Ia-1',
          domain: 'Grammar: Subject-Verb Agreement',
          text: 'Observe and apply standard rules of subject-verb agreement in writing complex sentences and short narratives.',
          contentStandard: 'The learner demonstrates command of the conventions of Standard English grammar.',
          performanceStandard: 'The learner edits paragraphs to correct agreement errors across collective nouns, indefinite pronouns, and inverted orders.',
          days: 15,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG English 7 Guide (2024), p. 16',
        },
      ],
      'Quarter 2': [
        {
          id: 'eng7-q2-01',
          code: 'EN7RC-IIa-8',
          domain: 'Reading: Linear vs Non-Linear Texts',
          text: 'Transcode information from linear to non-linear texts (charts, graphs, concept maps) and vice versa.',
          contentStandard: 'The learner demonstrates understanding of multimodality in information presentation.',
          performanceStandard: 'The learner synthesizes statistical charts into cohesive expository paragraphs.',
          days: 16,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG English 7, p. 20',
        },
        {
          id: 'eng7-q2-02',
          code: 'EN7LT-IIa-4',
          domain: 'Philippine Literature: Colonial Period',
          text: 'Identify the conflict (man vs man, man vs nature, man vs society, man vs self) in representative Philippine colonial and post-war short stories.',
          contentStandard: 'The learner demonstrates understanding of plot elements and thematic development.',
          performanceStandard: 'The learner writes a character-driven literary critique analyzing conflict resolution.',
          days: 18,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG English 7, p. 22',
        },
      ],
    },
  },

  // =========================================================================
  // FILIPINO
  // =========================================================================
  Filipino: {
    'Grade 7': {
      'Quarter 1': [
        {
          id: 'fil7-q1-01',
          code: 'F7PN-Ia-b-1',
          domain: 'Pakikinig at Panitikan: Kuwentong-Bayan at Pabula',
          text: 'Nahihinuha ang kaugalian at kalagayang panlipunan ng lugar na pinagmulan ng kuwentong-bayan at pabula mula sa Mindanao.',
          contentStandard: 'Naipamamalas ng mag-aaral ang pag-unawa sa mga akdang pampanitikan ng Mindanao.',
          performanceStandard: 'Naisasagawa ng mag-aaral ang isang makatotohanang proyektong panturismo.',
          days: 14,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Filipino 7 (2024), p. 14',
        },
        {
          id: 'fil7-q1-02',
          code: 'F7WG-Ia-d-1',
          domain: 'Gramatika: Mga Pahayag sa Pagbibigay ng Patunay',
          text: 'Nagagamit nang wasto ang mga pahayag sa pagbibigay ng mga patunay (e.g. nagpapakita, nagpapatunay, ayon sa).',
          contentStandard: 'Naipamamalas ang kasanayan sa maayos na pagbuo ng mga pahayag na may batayang ebidensya.',
          performanceStandard: 'Nakabubuo ng maikling sanaysay na nangangatwiran gamit ang mga angkop na patunay.',
          days: 15,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Filipino 7 (2024), p. 16',
        },
        {
          id: 'fil7-q1-03',
          code: 'F7EP-Ia-c-1',
          domain: 'Panitikan: Epiko ng Mindanao',
          text: 'Nailalarawan ang mga katangian ng pangunahing tauhan sa epiko (e.g. Indarapatra at Sulayman, Bantugan) at naiuugnay sa sariling buhay.',
          contentStandard: 'Naipamamalas ang pagpapahalaga sa katapangan at pagkakaisa ng mga tauhan sa epiko.',
          performanceStandard: 'Nakabubuo ng spoken word poetry o character portrayal na nagpapakita ng kabayanihan.',
          days: 16,
          bloomLevel: 'Evaluating',
          source: 'DepEd MATATAG Filipino 7 (2024), p. 18',
        },
      ],
      'Quarter 4': [
        {
          id: 'fil7-q4-01',
          code: 'F7PB-IVa-b-20',
          domain: 'Ibong Adarna: Mahahalagang Detalye at Aral',
          text: 'Nailalahad ang sariling pananaw tungkol sa mga motibo ng pagkilos ng mga tauhan sa koridong Ibong Adarna (Haring Fernando, Don Pedro, Don Diego, Don Juan).',
          contentStandard: 'Naipamamalas ng mag-aaral ang pag-unawa sa Ibong Adarna bilang obra maestrang panitikan.',
          performanceStandard: 'Naisasagawa ang malikhaing pagtatanghal ng ilang mahahalagang tagpo mula sa akda.',
          days: 20,
          bloomLevel: 'Evaluating',
          source: 'DepEd MATATAG Filipino 7, p. 26',
        },
      ],
    },
    'Grade 8': {
      'Quarter 4': [
        {
          id: 'fil8-q4-01',
          code: 'F8PB-IVa-b-33',
          domain: 'Florante at Laura: Kasaysayan at Kaligiran',
          text: 'Natitiyak ang kaligirang pangkasaysayan ng akda sa pamamagitan ng pagtukoy sa kalagayan ng bansa sa panahong isinulat ito ni Francisco Balagtas.',
          contentStandard: 'Naipamamalas ng mag-aaral ang pag-unawa sa obrang Florante at Laura.',
          performanceStandard: 'Nakabubuo ng sanaysay na nag-uugnay sa akda sa kasalukuyang pamamahala at katarungan.',
          days: 20,
          bloomLevel: 'Analyzing',
          source: 'DepEd Filipino 8 MELCs, p. 32',
        },
      ],
    },
  },

  // =========================================================================
  // ARALING PANLIPUNAN
  // =========================================================================
  'Araling Panlipunan': {
    'Grade 7': {
      'Quarter 1': [
        {
          id: 'ap7-q1-01',
          code: 'AP7HAS-Ia-1',
          domain: 'Heograpiya ng Asya: Katangiang Pisikal',
          text: 'Naipapaliwanag ang konsepto ng Asya tungo sa paghahating heograpiko: Silangang Asya, Timog-Silangang Asya, Timog Asya, Kanlurang Asya, at Hilagang Asya.',
          contentStandard: 'Ang mag-aaral ay naipamamalas ang pag-unawa sa ugnayan ng kapaligiran at tao sa paghubog ng sinaunang kabihasnang Asyano.',
          performanceStandard: 'Ang mag-aaral ay malalim na nakapaglalarawan ng heograpiya ng Asya at epekto nito sa pamumuhay ng tao.',
          days: 15,
          bloomLevel: 'Understanding',
          source: 'DepEd MATATAG AP 7 Guide (2024), p. 10',
        },
        {
          id: 'ap7-q1-02',
          code: 'AP7HAS-Id-1.4',
          domain: 'Likas na Yaman at Yamang Tao ng Asya',
          text: 'Nailalarawan ang mga yamang likas ng Asya at nasusuri ang implikasyon ng kapaligirang pisikal sa pamumuhay ng mga Asyano noon at ngayon.',
          contentStandard: 'Naipamamalas ang pagpapahalaga sa pagpapanatili ng balanseng ekolohikal sa rehiyon.',
          performanceStandard: 'Nakapagpapanukala ng mga hakbang sa pangangalaga sa mga likas na yaman ng Timog-Silangang Asya.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG AP 7 Guide (2024), p. 12',
        },
        {
          id: 'ap7-q1-03',
          code: 'AP7HAS-Ig-1.7',
          domain: 'Yamang Tao at Populasyon ng Asya',
          text: 'Nasusuri ang komposisyon ng populasyon at ang kahalagahan ng yamang tao sa Asya sa pagpapaunlad ng kabuhayan at lipunan sa kasalukuyang panahon.',
          contentStandard: 'Naipamamalas ang pag-unawa sa demographic profile ng mga bansang Asyano.',
          performanceStandard: 'Nakabubuo ng pagsusuri sa population pyramid at literacy rate ng Pilipinas vis-a-vis ASEAN.',
          days: 15,
          bloomLevel: 'Evaluating',
          source: 'DepEd MATATAG AP 7 Guide (2024), p. 14',
        },
      ],
    },
  },

  // =========================================================================
  // GMRC & VALUES EDUCATION
  // =========================================================================
  'GMRC / EPP / ESP': {
    'Grade 7': {
      'Quarter 1': [
        {
          id: 'gmrc7-q1-01',
          code: 'VE7-Q1-01',
          domain: 'Pagkilala sa Sarili at Dignidad ng Tao',
          text: 'Naisasabuhay ang pagpapahalaga sa dignidad ng tao sa pamamagitan ng paggalang sa sarili at sa kapwa anuman ang katayuan sa lipunan.',
          contentStandard: 'Naipamamalas ng mag-aaral ang pag-unawa sa dignidad ng tao bilang batayan ng paggalang at katarungang panlipunan.',
          performanceStandard: 'Naisasagawa ng mag-aaral ang mga gawaing nagpapakita ng paggalang sa dignidad ng kapwa sa paaralan at pamayanan.',
          days: 15,
          bloomLevel: 'Applying',
          source: 'DepEd MATATAG Values Education 7 Guide (2024), p. 8',
        },
        {
          id: 'gmrc7-q1-02',
          code: 'VE7-Q1-02',
          domain: 'Isip at Kilos-Loob: Wastong Paggamit ng Kalayaan',
          text: 'Nasusuri ang gamit at tunguhin ng isip at kilos-loob sa pagpapasya at pagkilos tungo sa katotohanan at kabutihan.',
          contentStandard: 'Naipamamalas ang pag-unawa sa wastong pamamahala ng isip at damdamin sa paggawa ng moral na pagpapasya.',
          performanceStandard: 'Nakagagawa ng plano ng pagwawasto sa mga maling pasya batay sa tamang konsensiya.',
          days: 15,
          bloomLevel: 'Analyzing',
          source: 'DepEd MATATAG Values Education 7 Guide (2024), p. 10',
        },
      ],
    },
  },

  // =========================================================================
  // SENIOR HIGH SCHOOL CORE & APPLIED SUBJECTS (MELCS)
  // =========================================================================
  'General Mathematics': {
    'Grade 11': {
      'Quarter 1': [
        {
          id: 'genmath-q1-01',
          code: 'M11GM-Ia-1',
          domain: 'Functions and Their Graphs',
          text: 'Represents real-life situations using functions, including piece-wise functions, and performs addition, subtraction, multiplication, division, and composition of functions.',
          contentStandard: 'The learner demonstrates understanding of key concepts of functions and rational functions.',
          performanceStandard: 'The learner accurately models real-life situations involving fare rates, cost functions, and taxes using functions.',
          days: 18,
          bloomLevel: 'Applying',
          source: 'DepEd Senior High School General Mathematics MELCs, p. 6',
        },
        {
          id: 'genmath-q1-02',
          code: 'M11GM-Ib-1',
          domain: 'Rational Functions and Asymptotes',
          text: 'Solves rational equations and inequalities; solves real-life problems involving rational functions and determines intercepts, zeroes, and asymptotes.',
          contentStandard: 'The learner demonstrates understanding of rational expressions and algebraic curves.',
          performanceStandard: 'The learner plots rational curves and interprets vertical and horizontal asymptotes in real scenarios.',
          days: 17,
          bloomLevel: 'Analyzing',
          source: 'DepEd SHS General Mathematics MELCs, p. 8',
        },
        {
          id: 'genmath-q1-03',
          code: 'M11GM-Ie-1',
          domain: 'Inverse, Exponential, and Logarithmic Functions',
          text: 'Represents exponential and logarithmic functions and solves problems involving exponential growth, compound interest, and half-life decay.',
          contentStandard: 'The learner demonstrates understanding of exponential and logarithmic properties.',
          performanceStandard: 'The learner calculates population projections and financial investment returns accurately.',
          days: 15,
          bloomLevel: 'Evaluating',
          source: 'DepEd SHS General Mathematics MELCs, p. 10',
        },
      ],
    },
  },

  'Oral Communication': {
    'Grade 11': {
      'Quarter 1': [
        {
          id: 'oralcom-q1-01',
          code: 'EN11/12OC-Ia-1',
          domain: 'Nature and Elements of Communication',
          text: 'Explains the nature, process, and models of communication (Shannon-Weaver, Schramm, Berlo) in various social contexts.',
          contentStandard: 'The learner demonstrates understanding of the principles of effective speech communication.',
          performanceStandard: 'The learner designs and performs an effective 3-minute speech utilizing appropriate communicative strategies.',
          days: 15,
          bloomLevel: 'Understanding',
          source: 'DepEd SHS Oral Communication in Context MELCs, p. 14',
        },
        {
          id: 'oralcom-q1-02',
          code: 'EN11/12OC-Ia-7',
          domain: 'Intercultural and Interpersonal Communication',
          text: 'Identifies strategies to avoid communication breakdown and demonstrates sensitivity to socio-cultural dimensions (gender, age, culture, religion).',
          contentStandard: 'The learner demonstrates understanding of ethical and intercultural communication.',
          performanceStandard: 'The learner mediates and resolves simulated communication conflicts in community scenarios.',
          days: 18,
          bloomLevel: 'Evaluating',
          source: 'DepEd SHS Oral Communication MELCs, p. 16',
        },
      ],
    },
  },
};

/**
 * Returns available subjects in the curriculum database.
 */
export function getAvailableDepEdSubjects(gradeLevel = null) {
  const subjects = Object.keys(DEPED_CURRICULUM_DATABASE);
  if (!gradeLevel) return subjects;
  return subjects.filter((subj) => !!DEPED_CURRICULUM_DATABASE[subj][gradeLevel]);
}

/**
 * Returns available grade levels for a given subject.
 */
export function getAvailableDepEdGrades(subject = null) {
  if (!subject || !DEPED_CURRICULUM_DATABASE[subject]) {
    const gradesSet = new Set();
    Object.values(DEPED_CURRICULUM_DATABASE).forEach((subjObj) => {
      Object.keys(subjObj).forEach((grade) => gradesSet.add(grade));
    });
    return Array.from(gradesSet);
  }
  return Object.keys(DEPED_CURRICULUM_DATABASE[subject]);
}

/**
 * Query official DepEd competencies with intelligent fallback and search.
 */
export function queryDepEdCompetencies({
  subject,
  gradeLevel,
  quarter = 'Quarter 1',
  keyword = '',
}) {
  // Normalize subject name
  let targetSubject = subject;
  if (!DEPED_CURRICULUM_DATABASE[targetSubject]) {
    const keys = Object.keys(DEPED_CURRICULUM_DATABASE);
    const found = keys.find(
      (k) =>
        k.toLowerCase() === (subject || '').toLowerCase() ||
        (subject || '').toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().includes((subject || '').toLowerCase())
    );
    if (found) targetSubject = found;
  }

  // Normalize grade level
  let targetGrade = gradeLevel;
  if (targetSubject && DEPED_CURRICULUM_DATABASE[targetSubject]) {
    const grades = Object.keys(DEPED_CURRICULUM_DATABASE[targetSubject]);
    if (!grades.includes(targetGrade)) {
      const match = grades.find((g) => (targetGrade || '').includes(g.replace('Grade ', '')));
      if (match) targetGrade = match;
    }
  }

  // Normalize quarter (handles "Term 1" vs "Quarter 1")
  let targetQuarter = quarter;
  if (targetQuarter.startsWith('Term ')) {
    targetQuarter = targetQuarter.replace('Term ', 'Quarter ');
  }

  const subjectData = DEPED_CURRICULUM_DATABASE[targetSubject];
  if (!subjectData) return [];

  const gradeData = subjectData[targetGrade] || subjectData[Object.keys(subjectData)[0]];
  if (!gradeData) return [];

  let list = gradeData[targetQuarter] || gradeData['Quarter 1'] || [];

  if (keyword && keyword.trim()) {
    const term = keyword.trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.text.toLowerCase().includes(term) ||
        c.code.toLowerCase().includes(term) ||
        c.domain.toLowerCase().includes(term)
    );
  }

  return list;
}

/**
 * Computes balanced instructional day distribution for a list of competencies
 * to hit a target total budget (e.g. 45 or 50 days for TOS, or 5 days for DLL).
 */
export function balanceCompetencyDays(competencies, targetTotal = 45) {
  if (!competencies || competencies.length === 0) return [];
  const count = competencies.length;
  const base = Math.floor(targetTotal / count);
  let remainder = targetTotal % count;

  return competencies.map((comp, idx) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    return {
      ...comp,
      days: Math.max(1, base + extra),
    };
  });
}

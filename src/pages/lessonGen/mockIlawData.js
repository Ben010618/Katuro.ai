export const MOCK_TEACHER_PROFILE = {
  name: 'SANTOS, MARIA',
  nameFull: 'Maria Santos',
  position: 'Teacher III',
  supervisorName: 'DELA CRUZ, JUAN A.',
  supervisorNameFull: 'Juan A. dela Cruz',
  supervisorPosition: 'Master Teacher II',
  school: 'Rizal National High School',
};

export const MOCK_LESSON_META = {
  lessonName: 'Indicators of Chemical Reactions',
  subject: 'Science',
  gradeLevel: 'Grade 10',
  gradeSection: 'Grade 10 – Rizal',
  term: 'Term 2',
  weekNumber: 'Week 4',
  references: "Science 10 Learner's Module pp. 120–135; MATATAG Science 10 Curriculum Guide Term 2",
  declaration: 'This lesson plan was formulated with the assistance of kaTuro AI, an AI-powered lesson planning tool for Filipino public school teachers. The teacher reviewed and edited all AI-generated content to ensure alignment with learner needs and local context. Ref: DepEd DO 3, 2026 Annex A.',
  competency: 'describe the indicators for a chemical reaction as color change, the formation of a precipitate, the release of gas, and/or odor, or a change in temperature;',
};

export const MOCK_SESSIONS = [
  {
    sessionNumber: 1,
    date: 'Tue, May 19',
    dateHeader: 'Tuesday, May 19',
    objectives:
      '1. Identify the five indicators of a chemical reaction.\n2. Name each indicator with an example.',

    prelesson:
      "Review: Ask learners to recall physical changes (melting ice, tearing paper). Message: 'Today we will discover signs that tell us a NEW substance has been formed.'",

    flow:
      "1. Meeting Time 1: Discuss 'Have you ever seen iron rust or milk spoil? What changed?'\n" +
      '2. Work Period 1: Teacher presents each indicator with a visual. Independent: Sort picture cards — physical or chemical change?\n' +
      "3. Meeting Time 2: Discuss answers. Introduce the term 'chemical reaction indicator.'\n" +
      '4. Work Period 2: Fill in the Indicators Chart with examples.\n' +
      "5. Indoor/Outdoor: 'Indicator Hunt' — find 3 signs of chemical reactions at home (photo or draw).",

    resources:
      'Science 10 LM pp. 120–125, Indicator picture cards, Reaction chart template',

    integration:
      'GMRC: Appreciating change as part of life — just as substances change, people grow and transform too. (Makatao)',

    formativeAssessment:
      'Exit Card: Name 3 out of 5 indicators of a chemical reaction. Give one example each.',

    extendedLearning:
      'At home: Look for 2 signs of chemical reactions in your kitchen. Take a photo or make a drawing. Bring to class tomorrow.',

    reflection:
      '*(To be filled after the lesson)*\nReflection Prompt: Did learners confuse chemical change indicators with signs of physical change? Which indicator was hardest for them to grasp?',
  },
  {
    sessionNumber: 2,
    date: 'Wed, May 20',
    dateHeader: 'Wednesday, May 20',
    objectives:
      '1. Explain each indicator and how it differs from a physical change.\n2. Give real-life examples of each indicator.',

    prelesson:
      "Review yesterday's 5 indicators. Show a short video clip of a chemical reaction. Message: 'Can you name what you observed?'",

    flow:
      "1. Meeting Time 1: Review 5 indicators. Discuss: 'Which one do you think is hardest to detect? Why?'\n" +
      '2. Work Period 1: Guided comparison chart — Physical vs. Chemical. Independent: Match scenarios to the correct indicator type.\n' +
      '3. Meeting Time 2: Group share-out. Clarify misconceptions.\n' +
      '4. Work Period 2: Mini-write: Describe a chemical reaction you have seen at home.\n' +
      "5. Indoor/Outdoor: 'Indicator Scavenger Hunt' in the school garden — observe and record.",

    resources:
      'Comparison chart worksheet, Science 10 LM pp. 126–130, Whiteboard',

    integration:
      'Math: Using tables and charts to organize and compare data systematically.',

    formativeAssessment:
      'Quick Quiz (5 items): Match the scenario to its chemical reaction indicator.\nAccommodation: Allow oral response for learners with writing difficulty.',

    extendedLearning:
      'Research: Find one industrial process that uses a chemical reaction (e.g., cooking, cement-making). Share a 2-sentence description next session.',

    reflection:
      '*(To be filled after the lesson)*\nReflection Prompt: Were learners able to distinguish between indicators independently, or did they need guided support?',
  },
  {
    sessionNumber: 3,
    date: 'Thu, May 21',
    dateHeader: 'Thursday, May 21',
    objectives:
      '1. Conduct a simple experiment to observe chemical reaction indicators.\n2. Record observations and identify which indicators were present.',

    prelesson:
      "Display materials on the table. Ask: 'What do you think will happen when we mix these?' Review safety reminders.",

    flow:
      "1. Meeting Time 1: Brief experiment demo by teacher — vinegar + baking soda. Ask: 'What indicators can you observe?'\n" +
      '2. Work Period 1: Group experiment — mixing provided substances, recording observations.\n' +
      "3. Meeting Time 2: Groups report findings. Discuss: 'How do we know a chemical reaction occurred?'\n" +
      '4. Work Period 2: Complete the observation report form.\n' +
      '5. Indoor/Outdoor: Clean-up and reflection on lab safety.',

    resources:
      'Vinegar, baking soda, iodine solution, milk, lemon juice, observation report form, safety goggles',

    integration:
      'TLE/Health: Laboratory safety practices and proper handling of household chemicals.',

    formativeAssessment:
      'Performance Task: Complete the observation report form accurately.\nRubric: Accuracy of observations, completeness, neatness.',

    extendedLearning:
      "Family activity: With a parent's help, mix baking soda and vinegar at home. Observe and list all indicators you saw. Write your observations in your notebook.",

    reflection:
      '*(To be filled after the lesson)*\nReflection Prompt: How did learners respond to the experiment? Which group showed the clearest understanding of the indicators through their observations?',
  },
];

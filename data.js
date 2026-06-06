// Demo quest data — hardcoded for Phase 1
// Positions are percentages of the map canvas (x, y)

const DEMO_DATA = {
  character: {
    name: "Kirk",
    class: "Chronicler",
    level: 3,
    xp: 420,
    xpToNext: 490  // level 4 threshold
  },

  quests: [
    {
      id: "q1",
      title: "The First Spark",
      description: "Every great journey begins with a single idea committed to paper. Define what you're building and why.",
      arm: "creative",
      tier: "common",
      x: 40, y: 17,
      tasks: [
        "Write a one-paragraph vision statement",
        "Define the core problem you're solving",
        "Name the project"
      ],
      tasksDone: [true, true, true],
      requires: [],
      completedAt: "2026-05-10T09:00:00Z",
      createdAt: "2026-05-01T00:00:00Z"
    },
    {
      id: "q2",
      title: "The Cartographer's Draft",
      description: "Sketch the overworld. Lay out the terrain, the quest nodes, the roads between them. This is the map before the map.",
      arm: "apps",
      tier: "rare",
      x: 42, y: 41,
      tasks: [
        "Design the parchment map layout",
        "Define quest node visual language",
        "Wire up terrain textures",
        "Build dependency connector lines"
      ],
      tasksDone: [true, true, true, false],
      requires: ["q1"],
      completedAt: null,
      createdAt: "2026-05-12T00:00:00Z"
    },
    {
      id: "q3",
      title: "The Chronicle Begins",
      description: "A writer's life demands its own map. Plot the arc from first draft to finished manuscript — chapter by chapter.",
      arm: "writing",
      tier: "epic",
      x: 72, y: 53,
      tasks: [
        "Write chapter outline (all acts)",
        "Draft Act I",
        "Draft Act II",
        "Draft Act III",
        "First revision pass"
      ],
      tasksDone: [true, false, false, false, false],
      requires: ["q1"],
      completedAt: null,
      createdAt: "2026-05-15T00:00:00Z"
    },
    {
      id: "q4",
      title: "The Market Square",
      description: "Build the launch presence. Landing page, pricing, and the first public signal that something is coming.",
      arm: "creative",
      tier: "rare",
      x: 32, y: 58,
      tasks: [
        "Register the domain",
        "Build the landing page",
        "Set up Gumroad listing",
        "Write launch copy"
      ],
      tasksDone: [false, false, false, false],
      requires: ["q2"],
      completedAt: null,
      createdAt: "2026-05-20T00:00:00Z"
    },
    {
      id: "q5",
      title: "Thirty Days in the Wilderness",
      description: "Run your actual life through the app for 30 days. No feature changes — just living inside it. See what breaks, what resonates, what you actually need.",
      arm: "life",
      tier: "legendary",
      x: 66, y: 63,
      tasks: [
        "Import real active quests",
        "Daily check-in for 30 days",
        "Note friction points",
        "Note moments of delight",
        "Write a retrospective"
      ],
      tasksDone: [false, false, false, false, false],
      requires: ["q2"],
      completedAt: null,
      createdAt: "2026-05-20T00:00:00Z"
    },
    {
      id: "q6",
      title: "The Guild Announcement",
      description: "Plant the flag. Post the screenshot to the world and tell them what you're building. The adventure is now public.",
      arm: "creative",
      tier: "rare",
      x: 35, y: 76,
      tasks: [
        "Capture screenshot-worthy map state",
        "Write the announcement thread",
        "Post to Twitter/X",
        "Post to relevant communities"
      ],
      tasksDone: [false, false, false, false],
      requires: ["q4"],
      completedAt: null,
      createdAt: "2026-05-22T00:00:00Z"
    },
    {
      id: "q7",
      title: "The Dark Tower",
      description: "The hardest quest. Build the Phase 2 productivity layer — everything that turns a beautiful demo into a daily driver.",
      arm: "apps",
      tier: "legendary",
      x: 50, y: 88,
      tasks: [
        "Add / edit / delete quests in-app",
        "Drag-to-reposition nodes",
        "The Chronicle view",
        "Achievements system",
        "JSON export/import"
      ],
      tasksDone: [false, false, false, false, false],
      requires: ["q5"],
      completedAt: null,
      createdAt: "2026-05-22T00:00:00Z"
    }
  ],

  achievements: [
    { id: "first-blood", title: "First Blood", desc: "Completed your first quest", unlockedAt: "2026-05-10T09:00:00Z" }
  ],

  chronicle: [
    {
      questId: "q1",
      title: "The First Spark",
      arm: "creative",
      tier: "common",
      completedAt: "2026-05-10T09:00:00Z",
      note: "The idea has a name. The map has a first pin."
    }
  ]
};

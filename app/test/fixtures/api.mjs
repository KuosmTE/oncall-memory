// Canned Jira REST for test/handlers.test.mjs. No network, no credentials.
const adf = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const person = (displayName) => ({ displayName, accountType: "atlassian" });

const MATCH = {
  key: "Q-2",
  fields: {
    summary: "Redis connection pool exhausted after deploy",
    description: adf("Deploys exhaust the redis connection pool and requests time out"),
    status: { name: "Done" },
    resolution: { name: "Done" },
    resolutiondate: "2026-10-01T10:00:00.000+0000",
    assignee: person("Ada Lovelace"),
    comment: {
      comments: [
        {
          author: person("Grace Hopper"),
          created: "2026-09-30T09:00:00.000+0000",
          body: adf("Raised the pool max, timeouts stopped"),
        },
      ],
    },
  },
};

const byUrl = [
  [
    /\/rest\/api\/3\/issue\/Q-1\?fields=summary,description,project/,
    {
      key: "Q-1",
      fields: {
        project: { key: "Q" },
        summary: "Redis connection pool exhausted after deploy",
        description: adf("Requests time out after a deploy, redis pool is full"),
      },
    },
  ],
  [/\/rest\/api\/3\/search\/jql/, { issues: [MATCH] }],
  [
    /\/rest\/api\/3\/issue\/Q-2\?expand=changelog/,
    {
      changelog: {
        histories: [
          {
            author: person("Max Taylor"),
            created: "2026-10-01T10:05:00.000+0000",
            items: [{ field: "resolution", toString: "Done" }],
          },
        ],
      },
    },
  ],
];

const client = {
  async requestJira(url) {
    const hit = byUrl.find(([re]) => re.test(url));
    if (!hit) {
      // A missing fixture must be loud: silently 404ing would make a test lie.
      return { ok: false, status: 404, json: async () => ({}), text: async () => `no fixture for ${url}` };
    }
    return { ok: true, status: 200, json: async () => hit[1], text: async () => JSON.stringify(hit[1]) };
  },
};

export default { asApp: () => client, asUser: () => client, fetch };

/** Forge's `route` tag: in the real SDK this encodes every interpolated query value
 * (safeUrl.js calls encodeURIComponent). This mirror concatenates so a probe's URL matches
 * the fixture regexes; do not read it as "nothing encodes downstream". */
export function route(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i]) : ""), "");
}

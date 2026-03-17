import { rootRoute } from "./routes/__root";
import { indexRoute } from "./routes/index";
import { agentsRoute } from "./routes/agents";
import { slackRoute } from "./routes/slack";
import { gitlabRoute } from "./routes/gitlab";
import { linearRoute } from "./routes/linear";
import { teamsRoute } from "./routes/teams";
import { workflowsRoute } from "./routes/workflows";
import { settingsRoute } from "./routes/settings";
import { todosRoute } from "./routes/todos";

export const routeTree = rootRoute.addChildren([indexRoute, agentsRoute, slackRoute, gitlabRoute, linearRoute, teamsRoute, workflowsRoute, settingsRoute, todosRoute]);

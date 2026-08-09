import { Context } from "grammy";

// Player-facing UI state (selected character, pending friend challenge) is
// persisted on the User row via stateService, not kept in an in-memory
// session, so it survives a bot restart.
export type BotContext = Context;

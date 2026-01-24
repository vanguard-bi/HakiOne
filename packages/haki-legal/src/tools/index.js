import { SEARCH_TOOL_DEFINITION, handleSearch } from "./search.js";

export const tools = [SEARCH_TOOL_DEFINITION];

export const handlers = {
  [SEARCH_TOOL_DEFINITION.name]: handleSearch,
};

import menu from "./menu.js";
import ping from "./ping.js";
import stock from "./stock.js";
import mirage from "./mirage.js";
import teste from "./teste.js";
import fruit from "./fruit.js";
import history from "./history.js";
import timeleft from "./timeleft.js";
import {
  addGroupAlertStock,
  removeGroupAlertStock,
  addStockNotifyGroup,
  removeStockNotifyGroup,
  addGroupEmergency,
  removeGroupEmergency,
  listGroupsAlerts
} from "./group-alerts.js";
import {
  addEmergencyFruit,
  removeEmergencyFruit,
  listEmergencyFruit
} from "./emergency.js";

export const COMMANDS = [
  menu,
  ping,
  stock,
  mirage,
  teste,
  fruit,
  history,
  timeleft,
  addGroupAlertStock,
  removeGroupAlertStock,
  addStockNotifyGroup,
  removeStockNotifyGroup,
  addGroupEmergency,
  removeGroupEmergency,
  listGroupsAlerts,
  addEmergencyFruit,
  removeEmergencyFruit,
  listEmergencyFruit
];

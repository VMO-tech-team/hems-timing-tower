/*
The following is an example output from the WebSocket server:

{
  "SessionType": "Race(10)",                    // Indicates the type of session.
  "SessionPhase": "GreenFlag",                  // Indicates the current phase of the session (Garage, WarmUp, GridWalk, Formation, Countdown, GreenFlag, FullCourseYellow, SessionStopped, SessionOver, PausedOrHeartbeat).
  "TimeLeft": 2837.8,                           // The time (seconds) remaining in the session.
  "TotalLaps": 12,                              // The maximum number of laps for the race (This is set to 2147483647 for timed sessions with no lap limit).
  "LeaderLapCount": 8,                          // The current lap number of the race leader.
  "Drivers": [
    {
      "Position": 1,                            // The driver's current position.
      "StartingPosition": 1,                    // The driver's starting position.
      "DriverName": "Driver A",                 // Name of the driver.
      "TimeBehindNext": 0.0,                    // Time in seconds behind the next driver.
      "TimeBehindLeader": 0.0,                  // Time in seconds behind the race leader.
      "LapsBehindLeader": 0,                    // Number of laps behind the race leader.
      "LastLapTime": 58.133827209472656,        // The driver's last laptime in seconds.
      "BestLapTime": 58.133827209472656,        // The driver's best laptime in seconds.
      "BoostState": 0,                          // State of the boost motor (0 = off, 1 = on, 2 = boost is unavailable due to time depletion, 3 = boost time and laps depleted).
      "BoostLapsUsed": 0,                       // Number of laps where the boost was used.
      "BoostLapsTotal": 1,                      // Total number of laps available for using the boost.
      "TireCompound": "Soft"                    // Tire compound currently used by the driver.
    },
    {
      "Position": 2,
      "StartingPosition": 2,
      "DriverName": "Driver B",
      "TimeBehindNext": 0.8640289306640625,
      "TimeBehindLeader": 0.8640289306640625,
      "LapsBehindLeader": 0,
      "LastLapTime": 58.321258544921875,
      "BestLapTime": 58.246947897456463,
      "BoostState": 0,
      "BoostLapsUsed": 1,
      "BoostLapsTotal": 3,
      "TireCompound": "Medium"
    }
  ]
}
*/

// Profiles to display during Practice (BestLapTime, GapToBestLap)
const practiceProfiles = ["BestLapTime", "GapToBestLap", "IntervalBestLap"]; // Define multiple profiles
let currentPracticeProfileIndex = 0; // Start with the first profile

const qualificationProfiles = [
  "BestLapTime",
  "GapToBestLap",
  "IntervalBestLap",
]; // Define multiple qualification profiles
let currentQualificationProfileIndex = 0; // Start with the first qualification profile

const raceProfiles = [
  "GapToLeader",
  "GapToDriverInFront",
  "BoostLaps",
  "PositionChange",
]; // Added BoostLaps profile
let currentRaceProfileIndex = 1; // Start with the first race profile

//let raceInfoModes = ['BoostState', 'TireCompound'];  // Modes to cycle through
let currentModeIndex = 0; // Start with the first mode
let raceInfoMode = "BestLapTime"; // Default mode
let showLast10Cars = false;

let socket = null;
let currentSession = null;
let leaderLapCount = 0;
let lastDriverCrossedLine = null;

let previousData = {};
let driverData = {};

// Assuming you know the total number of columns including status and clock columns
const totalColumns = 7; // Replace with your actual total column count

// Calculate the colspan for the tidkvar-cell
const tidkvarColspan = totalColumns - 2; // Subtracting the status and clock columns

// Set the colspan attribute when generating the header row
const headerRow = document.createElement("tr");

headerRow.innerHTML = `
    <td class="status-column"></td>
    <td colspan="${tidkvarColspan}" class="tidkvar-cell">
        <div class="tidkvar-container">
            <!-- ... your tidkvar content ... -->
        </div>
    </td>
    <td class="clock-column"></td>
`;

const tableHead = document.createElement("thead");
tableHead.appendChild(headerRow);

const driverTable = document.querySelector(".driver-table");
driverTable.insertBefore(tableHead, driverTable.firstChild);

setInterval(() => {
  if (currentSession && currentSession.SessionType.startsWith("Practice")) {
    currentPracticeProfileIndex =
      (currentPracticeProfileIndex + 1) % practiceProfiles.length;
    raceInfoMode = practiceProfiles[currentPracticeProfileIndex];
    console.log("Practice profile:", raceInfoMode); // Debugging profile
  } else if (currentSession && currentSession.SessionType.startsWith("Race")) {
    currentRaceProfileIndex =
      (currentRaceProfileIndex + 1) % raceProfiles.length;
    raceInfoMode = raceProfiles[currentRaceProfileIndex];
    console.log("Race profile:", raceInfoMode); // Debugging profile
  } else if (
    currentSession &&
    currentSession.SessionType.startsWith("Qualifying")
  ) {
    // Correct SessionType
    currentQualificationProfileIndex =
      (currentQualificationProfileIndex + 1) % qualificationProfiles.length;
    raceInfoMode = qualificationProfiles[currentQualificationProfileIndex];
    console.log("Qualifying profile:", raceInfoMode); // Debugging profile
  } else if (
    currentSession &&
    currentSession.SessionType.startsWith("Warmup")
  ) {
    // Correct SessionType
    console.log("Warmup profile"); // Debugging profile
  } else {
    console.log("Unknown session type: ", currentSession.SessionType); // Debugging session type
  }

  if (currentSession) {
    updateDriverList(currentSession); // Rebuild the table with the new mode
  }
}, 10000); // Switch every 10 seconds

setInterval(() => {
  showLast10Cars = !showLast10Cars;
}, 10000);

function updateDriverList(session) {
  const driverList = document.getElementById("driverList");
  driverList.innerHTML = "";

  // Hämta den bästa sektortiden och bästa varvtiden för alla förare
  const overallBestSectors = getOverallBestSectors(session);

  // Calculate the fastest lap time (ignore 0 or invalid times)
  const validLapTimes = session.Drivers.map(
    (driver) => driver.BestLapTime
  ).filter((lapTime) => lapTime > 0); // Filter valid lap times only
  const fastestLap = validLapTimes.length > 0 ? Math.min(...validLapTimes) : 0;

  // Select the correct profile based on session type
  let config;
  if (session.SessionType.startsWith("Practice")) {
    config = [
      "Position",
      "DriverName",
      "Sectors",
      raceInfoMode,
      "TireBar",
      "BoostState",
      "StatusColumn",
    ];
  } else if (session.SessionType.startsWith("Qualifying")) {
    config = [
      "Position",
      "DriverName",
      "Sectors",
      raceInfoMode,
      "BoostState",
      "StatusColumn",
    ];
  } else if (session.SessionType.startsWith("Race")) {
    config = [
      "Position",
      "DriverName",
      raceInfoMode,
      "TireBar",
      "BoostState",
      "StatusColumn",
    ];
  } else if (session.SessionType.startsWith("Warmup")) {
    config = ["Position", "DriverName"];
    return;
  }

  // Filtrera bort förare som inte skall vara med i detta i kvalet
  const filteredDrivers = session.Drivers.filter((driver) => {
    if (session.SessionType.startsWith("Qualifying")) {
      return driver.ServerScored;
    }
    return true; // Visa alla förare i andra sessioner
  });

  let driversshown = 0;

  const top12 = filteredDrivers.filter((item) => item.Position <= 12);
  const top13to22 = filteredDrivers.filter(
    (item) => item.Position > 12 && item.Position < 23
  );
  const back23 = filteredDrivers.filter((item) => item.Position >= 23);

  const top22DriverList = [...top12, ...top13to22];
  const expandedDriverList = [...top12, ...back23];

  const gridToShow = showLast10Cars ? expandedDriverList : top22DriverList;

  gridToShow.forEach((driver) => {
    // Kod för att kunna hantera korrekta sektorsplits
    const driverId = driver.DriverName;

    if (!driverData[driverId]) {
      driverData[driverId] = {
        pitExitLap: null,
        lapsSincePit: null,
        previousTotalLaps: driver.TotalLaps || 0,
        previousSector1Color: "gray",
        previousSector2Color: "gray",
      };
    }

    const data = driverData[driverId];

    // Spåra när föraren lämnar depån
    if (!driver.InPits && data.pitExitLap === null) {
      // Föraren har lämnat depån
      data.pitExitLap = driver.TotalLaps;
    }

    // Nollställ pitExitLap när föraren går in i depån
    if (driver.InPits) {
      data.pitExitLap = null;
    }

    // Uppdatera antalet varv sedan depålämning
    if (data.pitExitLap !== null) {
      data.lapsSincePit = driver.TotalLaps - data.pitExitLap;
    } else {
      data.lapsSincePit = null;
    }

    // Uppdatera previousTotalLaps
    data.previousTotalLaps = driver.TotalLaps;

    // Uppdatera färger för sektor 1 och 2 när föraren avslutar sektor 2 (går in i sektor 3)
    if (
      driver.Sector === 0 &&
      driver.CurSector2 > 0 &&
      driver.CurSector2 !== -1
    ) {
      // Beräkna färgen för sektor 1
      let sector1Color = getSectorColor(
        driver.CurSector1,
        driver.BestLapSector1,
        overallBestSectors.Sector1
      );
      // Beräkna färgen för sektor 2
      let sector2Color = getSectorColor(
        driver.CurSector2,
        driver.BestLapSector2,
        overallBestSectors.Sector2
      );

      // Spara färgerna
      data.previousSector1Color = sector1Color;
      data.previousSector2Color = sector2Color;
    }

    // Lagra data i driver-objektet för enkel åtkomst
    driver.pitExitLap = data.pitExitLap;
    driver.lapsSincePit = data.lapsSincePit;
    driver.previousSector1Color = data.previousSector1Color;
    driver.previousSector2Color = data.previousSector2Color;

    // Koda för att skapa tabellen.

    const row = document.createElement("tr");
    driversshown++;
    row.innerHTML = config
      .map((col) =>
        generateCell(driver, col, fastestLap, session, overallBestSectors)
      )
      .join("");
    driverList.appendChild(row);

    // Add a clock icon if the driver has the fastest lap in race session
    if (
      driver.BestLapTime === fastestLap &&
      fastestLap > 0 &&
      session.SessionType.startsWith("Race")
    ) {
      row.insertAdjacentHTML(
        "beforeend",
        `<td class="clock-icon session-fastest-lap"><i class="fa-solid fa-clock"></i></td>`
      );
    } else {
      row.insertAdjacentHTML("beforeend", `<td></td>`); // Empty cell for others
    }
  });
}

function generateCell(driver, col, fastestLap, session, overallBestSectors) {
  let tireColor, backgroundColor, color;

  switch (col) {
    case "Position":
      return `<td class="position-column">${driver.Position}</td>`;
    case "BoostState":
      return `<td class="boost-state-column">${getBoostIcon(
        driver.BoostState
      )}</td>`;
    case "DriverName":
      // Returnera förarens namn i sin egen cell
      return `<td class="name-column">${formatDriverName(
        driver.DriverName
      )}</td>`;
    case "BestLapTime":
      if (driver.BestLapTime > 0) {
        return `<td class="best-lap-column">${getBestLapTime(
          driver.BestLapTime
        )}</td>`;
      } else {
        /*if (driver.InPits) return `<td class="pit-status-column">PIT</td>`;*/
        return `<td class="best-lap-column no-time">NO TIME</td>`; // Empty cell if no time
      }
    case "GapToBestLap":
      if (driver.BestLapTime > 0 && fastestLap > 0) {
        const gapToBest = (driver.BestLapTime - fastestLap).toFixed(3);
        return `<td class="gap-column">${
          gapToBest > 0 ? `+${gapToBest}s` : formatLapTime(fastestLap)
        }</td>`;
      } else {
        /*if (driver.InPits) return `<td class="pit-status-column">PIT</td>`;*/
        return `<td class="gap-column no-time">NO TIME</td>`; // Empty cell if no time
      }

    case "IntervalBestLap":
      const driverIndex = session.Drivers.findIndex(
        (d) => d.DriverName === driver.DriverName
      );

      // Om föraren inte har en tid, visa ingen cell (ingen bakgrund eller text)
      if (driver.BestLapTime <= 0) {
        /*if (driver.InPits) return `<td class="pit-status-column">PIT</td>`;*/
        return `<td class="gap-column no-time">NO TIME</td>`;
      }

      // Om föraren är ledaren, visa "Int."
      if (driverIndex === 0) {
        return `<td class="gap-column">Int.</td>`;
      }

      // Hämta föregående förare
      const previousDriver = session.Drivers[driverIndex - 1];

      // Om den föregående föraren inte har en tid, visa ingen cell
      if (previousDriver.BestLapTime <= 0) {
        return `<td class="gap-column no-time">NO TIME</td>`;
      }

      // Beräkna intervallet mellan förarens bästa varvtid och föregående förarens bästa varvtid
      const intervalToPrevious = (
        driver.BestLapTime - previousDriver.BestLapTime
      ).toFixed(3);

      // Visa intervallet, med "+" om det är positivt
      return `<td class="gap-column">+${intervalToPrevious}s</td>`;

    case "GapToLeader":
      if (driver.LapsBehindLeader > 0) {
        // If the driver is behind in laps, show the number of laps behind
        const laps = driver.LapsBehindLeader;
        return `<td class="gap-column">+${laps} ${
          laps === 1 ? "Lap" : "Laps"
        }</td>`;
      } else if (driver.TimeBehindLeader > 0) {
        // If the driver is on the same lap, show the time behind the leader
        const timeGap = formatLapTime(driver.TimeBehindLeader);
        return `<td class="gap-column">+${timeGap}</td>`;
      } else {
        // If the driver is the leader, show "Leader"
        return `<td class="gap-column">Leader</td>`;
      }
    case "GapToDriverInFront":
      // Om föraren är ledaren, visa "Interval"
      if (driver.Position === 1) {
        return `<td class="gap-column">Interval</td>`;
      }

      // Om TimeBehindNext inte finns eller är mindre än 0, visa ingen cell
      if (driver.TimeBehindNext <= 0) {
        return `<td class="gap-column no-time">NO TIME</td>`;
      }

      // Visa skillnaden till föraren framför
      const gapToDriverInFront = driver.TimeBehindNext.toFixed(3);
      return `<td class="gap-column">+${gapToDriverInFront}s</td>`;

    case "BoostLaps":
      // Kombinera antal använda boost-lapser och totalt tillgängliga boost-lapser, följt av blixtrande symbolen
      const boostLapsText = `${driver.BoostLapsUsed}/${driver.BoostLapsTotal} Laps 🗲`;

      // Returnera texten med blixtrande symbolen i samma cell
      return `<td class="boost-laps-column">${boostLapsText}</td>`;

    case "PositionChange":
      const positionChange = driver.StartingPosition - driver.Position;
      let arrow;

      if (positionChange > 0) {
        arrow = "▲";
        color = "#28a745";
      } else if (positionChange < 0) {
        arrow = "▼";
        color = "red";
      } else {
        arrow = "⇔";
        color = "white";
      }

      return `
        <td class="position-change-column">
          <span style="color: ${color};">${arrow}</span> <span style="color: #fff;">${Math.abs(
        positionChange
      )}</span>
      </td>`;

    case "Sectors":
      let sector1Color = "gray";
      let sector2Color = "gray";
      let lapColor = "gray";

      // Om föraren är i depån eller inte har lämnat depån
      if (driver.InPits || driver.lapsSincePit === null) {
        // Visa inga staplar
        return `<td class="sector-column">
                            <div class="sector-container">
                                <div class="sector-bar" style="background-color: gray;"></div>
                                <div class="sector-bar" style="background-color: gray;"></div>
                                <div class="sector-bar" style="background-color: gray;"></div>
                            </div>
                        </td>`;
      }

      if (driver.lapsSincePit === 1) {
        // Inget skall tändas på utvarvet (=0)
        switch (driver.Sector) {
          case 2:
            // Föraren har nått sektor 2 på första varvet efter depå, sätt sektor1 baserat på status
            if (driver.CurSector1 > 0 && driver.CurSector1 !== -1) {
              sector1Color = getSectorColor(
                driver.CurSector1,
                driver.BestLapSector1,
                overallBestSectors.Sector1
              );
            } else {
              sector1Color = "red";
            }
            // Två och Tre förblir grå
            break;

          case 0:
            // Föraren har nått sektor 3 på första varvet efter depå, sätt sektor1 och sektor 2 baserat på status
            if (driver.CurSector1 > 0) {
              sector1Color = getSectorColor(
                driver.CurSector1,
                driver.BestLapSector1,
                overallBestSectors.Sector1
              );
            } else {
              sector1Color = "red";
            }
            if (driver.CurSector2 > 0) {
              sector2Color = getSectorColor(
                driver.CurSector2,
                driver.BestLapSector2,
                overallBestSectors.Sector2
              );
            } else {
              sector2Color = "red";
            }
            // Tre förblir grå
            break;
          case 1:
          default:
          // Låt alla tre vara gråa
        }
      } else {
        if (driver.lapsSincePit > 1) {
          // För efterföljande varv
          switch (driver.Sector) {
            case 2:
              // Föraren har nått sektor 2 på andra varvet efter depå, sätt sektor1 baserat på status
              if (driver.CurSector1 > 0 && driver.CurSector1 !== -1) {
                sector1Color = getSectorColor(
                  driver.CurSector1,
                  driver.BestLapSector1,
                  overallBestSectors.Sector1
                );
              } else {
                sector1Color = "red";
              }
              // Två och Tre förblir grå
              break;

            case 0:
              // Föraren har nått sektor 3 på andra varvet efter depå, sätt sektor1 och sektor 2 baserat på status
              if (driver.CurSector1 > 0) {
                sector1Color = getSectorColor(
                  driver.CurSector1,
                  driver.BestLapSector1,
                  overallBestSectors.Sector1
                );
              } else {
                sector1Color = "red";
              }
              if (driver.CurSector2 > 0) {
                sector2Color = getSectorColor(
                  driver.CurSector2,
                  driver.BestLapSector2,
                  overallBestSectors.Sector2
                );
              } else {
                sector2Color = "red";
              }
              // Tre förblir grå
              break;
            case 1:
              //                            console.log(`Förare: ${driver.DriverName}, FinishedStatus: ${driver.previousSector2Time}, CurSec2: ${driver.CurSector2}`);
              sector1Color = driver.previousSector1Color || "gray";
              sector2Color = driver.previousSector2Color || "gray";

              if (driver.LastLapTime > 0) {
                lapColor = getSectorColor(
                  driver.LastLapTime,
                  driver.BestLapTime,
                  overallBestSectors.Lap
                );
              } else {
                lapColor = "red";
              }
              break;

            default:
            // Låt alla tre vara gråa
          }
        }
      }

      return `<td class="sector-column">
                        <div class="sector-container">
                            <div class="sector-bar" style="background-color: ${sector1Color};"></div>
                            <div class="sector-bar" style="background-color: ${sector2Color};"></div>
                            <div class="sector-bar" style="background-color: ${lapColor};"></div>
                        </div>
                    </td>`;

    case "TireBar":
      switch (driver.TireCompound) {
        case "Soft":
          tireColor = "color: #f0f0f0; background-color:rgba(0, 0, 0, 0.9)";
          break;
        case "Medium":
          tireColor = "color: yellow; background-color: rgba(0, 0, 0, 0.9)";
          break;
        case "Hard":
          tireColor = "color: #ffcccc; background-color: rgba(0, 0, 0, 0.9)";
          break;
        case "Wet":
          tireColor = "color: blue; background-color: rgba(0, 0, 0, 0.9)";
          break;
        default:
          tireColor = "color: #cccccc; background-color: rgba(0, 0, 0, 0.9)";
      }
      return `<td class="tire-bar-column" style="${tireColor}">${driver.TireCompound.substring(
        0,
        1
      )}</td>`;

    case "StatusColumn":
      let statusContent;
      backgroundColor = "transparent"; // Standard bakgrundsfärg

      // Hantera driver.FinishStatus för att visa målflagga, DNF eller DSQ
      if (driver.FinishStatus > 0) {
        switch (driver.FinishStatus) {
          case 1:
            statusContent = `<i class="fa-solid fa-flag-checkered"></i>`; // Målflagga
            backgroundColor = "#fff"; // Grön bakgrund
            break;
          case 2:
            statusContent = "DNF";
            backgroundColor = "#dc3545"; // Röd bakgrund för DNF
            break;
          case 3:
            statusContent = "DSQ";
            backgroundColor = "#ffc107"; // Gul bakgrund för DSQ
            break;
          default:
            statusContent = `<i class="fa-solid fa-flag-checkered"></i>`; // Standard till målflagga om okänd FinishStatus
            backgroundColor = "#fff";
            break;
        }
      } else {
        // Kval- och träningssessioner
        if (
          currentSession.SessionType.startsWith("Qualifying") ||
          currentSession.SessionType.startsWith("Practice")
        ) {
          // Om föraren är i depån och tiden kvar är mindre än snabbaste varvtiden
          if (driver.InPits && currentSession.TimeLeft > 0 && fastestLap > 0) {
            if (currentSession.TimeLeft <= fastestLap) {
              statusContent = `<i class="fa-solid fa-flag-checkered"></i>`; // Målflagga
              backgroundColor = "#fff";
            }
          }

          // När tiden har löpt ut
          if (currentSession.TimeLeft <= 0) {
            // Kontrollera om föraren är på ett giltigt varv
            let onValidLap = false;

            if (driver.Sector === 1) {
              // Förare i sektor 1 kan inte bedömas, anta att de är på ett giltigt varv
              onValidLap = true;
            } else if (driver.Sector === 2) {
              // För förare i sektor 2, CurSector1 måste vara giltig (> -1)
              if (driver.CurSector1 > -1) {
                onValidLap = true;
              }
            } else if (driver.Sector === 0) {
              // Sektor 3 representeras som 0
              // För förare i sektor 3, både CurSector1 och CurSector2 måste vara giltiga (> -1)
              if (driver.CurSector1 > -1 && driver.CurSector2 > -1) {
                onValidLap = true;
              }
            }

            // Om föraren inte är på ett giltigt varv, visa målflagga
            if (!onValidLap) {
              statusContent = `<i class="fa-solid fa-flag-checkered"></i>`; // Målflagga
              backgroundColor = "#fff";
            }

            // Om föraren är i depån, visa målflagga
            if (driver.InPits) {
              statusContent = `<i class="fa-solid fa-flag-checkered"></i>`; // Målflagga
              backgroundColor = "#fff";
            }
          }
        }

        // Visa symbolen för den senaste föraren som har korsat linjen
        if (
          !statusContent &&
          driver.InGarageStall &&
          currentSession.SessionType.startsWith("Race") &&
          currentSession.SessionPhase == "GreenFlag"
        ) {
          // Om ingen målflagga visas, kolla om föraren är i garaget
          statusContent = "DNF";
          backgroundColor = "red";
          color = "#fff"; // Röd bakgrund för DNF
        }

        // Om ingen målflagga visas, kolla om föraren är i depån
        if (!statusContent && driver.InPits) {
          statusContent = "PIT";
          backgroundColor = "#e95f61";
          color = "#fff";
        }
      }

      if (statusContent) {
        return `<td class="status-column" style="background-color: ${backgroundColor}; color: ${color}; text-align: center;">
          ${statusContent}
        </td>`;
      }

      break;

    default:
      return `<td></td>`;
  }
}

// Function to display best lap time with the same background as boost icon
function getBestLapTime(bestLapTime) {
  const formattedLapTime = formatLapTime(bestLapTime);
  if (!formattedLapTime) return "";
  return `${formattedLapTime}`;
}

function getBoostIcon(boostState) {
  switch (boostState) {
    case 1: // Boost is on
      return `<div class="boost-box boost-on">🗲</div>`;
    case 0: // Boost is off
      return `<div class="boost-box boost-off">🗲</div>`;
    case 2: // Boost time depleted
      return `<div class="boost-box boost-time-depleted">⊝</div>`;
    case 3: // Boost laps depleted
      return `<div class="boost-box boost-laps-depleted">⊝</div>`;
    default:
      return `<div class="boost-box boost-off">N/A</div>`;
  }
}

// Format driver names to be "F LastName" (without the period)
function formatDriverName(fullName) {
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length < 2) return fullName; // Return as-is if there isn't a first and last name

  const firstName = nameParts[0].charAt(0).toUpperCase(); // First initial
  const lastName = nameParts[nameParts.length - 1].toUpperCase(); // Full last name
  return `${firstName}. ${lastName}`; // Space instead of a period
}

function formatLapTime(seconds) {
  if (!seconds || seconds <= 0) return ""; // Handle cases where lap time is not available

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds - Math.floor(seconds)) * 1000);

  return minutes > 0
    ? `${minutes}:${String(secs).padStart(2, "0")}.${String(
        milliseconds
      ).padStart(3, "0")}`
    : `${secs}.${String(milliseconds).padStart(3, "0")}`;
}

function formatSessionType(sessionType, raceNumber) {
  if (sessionType.startsWith("Qualifying")) {
    // Extract the number in parentheses and subtract 4
    const match = sessionType.match(/\((\d+)\)/);
    if (match) {
      const sessionNumber = parseInt(match[1], 10) - 4;
      return `Qualifying ${sessionNumber}`;
    }
    return "Qualifying";
  } else if (sessionType.startsWith("Practice")) {
    // Extract the number in parentheses and display it without parentheses
    const match = sessionType.match(/\((\d+)\)/);
    if (match) {
      return `Practice ${match[1]} - `.toUpperCase();
    }
    return "Practice";
  } else if (sessionType.startsWith("Race")) {
    return `Race ${raceNumber} - `;
  } else if (sessionType.startsWith("Warmup")) {
    // Just display "Race" without any numbers
    return "Warmup";
  }
  return sessionType; // Default case if none match
}

function sessionProgress(session) {
  return session.SessionType.startsWith("Race")
    ? getSessionProgressRace(session)
    : formatRaceTime(Math.max(session.TimeLeft, 0));
}

function getSessionProgressRace(session) {
  if (session.SessionPhase == "Formation") {
    return "Formation";
  } else {
    const isFinalLap = session.LeaderLapCount >= session.TotalLaps;
    return isFinalLap
      ? "FINAL LAP"
      : `${session.LeaderLapCount} / ${session.TotalLaps}`;
  }
}

function formatRaceTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(
        2,
        "0"
      )}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getTimestamp() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now
    .getMilliseconds()
    .toString()
    .padStart(3, "0")}`;
}

function adjustTidkvarColspan(sessionType) {
  let columnspan = 0;

  if (sessionType.startsWith("Race")) columnspan = 5;
  if (sessionType.startsWith("Qualifying")) columnspan = 6;
  if (sessionType.startsWith("Practice")) columnspan = 6;

  document
    .querySelector(".rubriker-container2")
    .setAttribute("colspan", columnspan);
}

function getSectorColor(currentTime, personalBest, overallBest) {
  if (currentTime <= 0) {
    return "gray"; // Inget värde, visa grå stapel
  }

  if (overallBest > 0 && currentTime <= overallBest) {
    return "#8e44ad"; // Lila för snabbaste sektortid
  } else if (
    (personalBest > 0 && currentTime <= personalBest) ||
    (personalBest <= 0 && currentTime > 0)
  ) {
    return "#27ae60"; // Grön för personlig bästa
  } else {
    return "#f1c40f"; // Gul för långsammare tid
  }
}

function getOverallBestSectors(session) {
  let bestSector1 = Infinity;
  let bestSector2 = Infinity;
  let bestLap = Infinity;

  session.Drivers.forEach((driver) => {
    if (driver.BestLapSector1 > 0 && driver.BestLapSector1 < bestSector1) {
      bestSector1 = driver.BestLapSector1;
    }
    if (driver.BestLapSector2 > 0 && driver.BestLapSector2 < bestSector2) {
      bestSector2 = driver.BestLapSector2;
    }
    if (driver.BestLapTime > 0 && driver.BestLapTime < bestLap) {
      bestLap = driver.BestLapTime;
    }
  });

  // Om ingen bästa sektortid finns ännu, använd de aktuella sektortiderna
  if (bestSector1 === Infinity) {
    const currentSectors1 = session.Drivers.map(
      (driver) => driver.CurSector1
    ).filter((time) => time > 0);
    if (currentSectors1.length > 0) {
      bestSector1 = Math.min(...currentSectors1);
    }
  }

  if (bestSector2 === Infinity) {
    const currentSectors2 = session.Drivers.map(
      (driver) => driver.CurSector2
    ).filter((time) => time > 0);
    if (currentSectors2.length > 0) {
      bestSector2 = Math.min(...currentSectors2);
    }
  }

  if (bestLap === Infinity) {
    const currentLapTimes = session.Drivers.map(
      (driver) => driver.LastLapTime
    ).filter((time) => time > 0);
    if (currentLapTimes.length > 0) {
      bestLap = Math.min(...currentLapTimes);
    }
  }

  return {
    Sector1: bestSector1 !== Infinity ? bestSector1 : 0,
    Sector2: bestSector2 !== Infinity ? bestSector2 : 0,
    Lap: bestLap !== Infinity ? bestLap : 0,
  };
}

function connectWebSocket() {
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    console.log(
      `[${getTimestamp()}] WebSocket already connected or reconnecting.`
    );
    return;
  }

  socket = new WebSocket("ws://vmotechteam.org:2095/overlay"); // Updated WebSocket server

  socket.onmessage = function (event) {
    const session = JSON.parse(event.data);

    // Kontrollera om sessionen har ändrats
    if (currentSession && currentSession.SessionType !== session.SessionType) {
      previousData = {};
    }

    currentSession = session;

    // Kontrollera om sessionen är en racesession
    if (currentSession.SessionType.startsWith("Race")) {
      // Anta att förarna är sorterade efter position i session.Drivers
      const leader = session.Drivers[0];
      leaderLapCount = leader.TotalLaps || 0;

      console.log({ session });

      // Nollställ senaste förare som har korsat linjen
      lastDriverCrossedLine = null;

      session.Drivers.forEach((driver) => {
        // Om föraren har samma antal varv som ledaren
        if (driver.TotalLaps === leaderLapCount) {
          // Uppdatera senaste föraren som har korsat linjen
          lastDriverCrossedLine = driver.DriverName;
        }
      });
    }

    document.getElementById("sessionType").textContent = formatSessionType(
      session.SessionType,
      session.RaceNumber
    );
    document.getElementById("raceProgress").textContent =
      sessionProgress(session);

    updateDriverList(session);
    adjustTidkvarColspan(session.SessionType); // To handle different number of columns in Qualifying and Race
  };

  socket.onopen = function () {
    console.log(`[${getTimestamp()}]Connected to WebSocket server`);
  };

  socket.onclose = function (event) {
    console.log(`[${getTimestamp()}] WebSocket connection closed.`);
    setTimeout(connectWebSocket, 1000); // Attempt to reconnect
  };

  socket.onerror = function (error) {
    console.error(`[${getTimestamp()}] WebSocket error:`, error);
  };
}

connectWebSocket();

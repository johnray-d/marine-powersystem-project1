# Marine Power System Simulator — ETO Training & Operations Tutorial

> **BS Electrical Engineering · Electro-Technical Officer (ETO) Specialization**
> Interactive 3D Digital Twin & Quasi-Steady-State Marine Power Management System (PMS) Lab (`6.6 kV` / `440 V` / `220 V`)
> 
> 🌐 **Live Web Simulator**: **[https://jro-d.github.io/marine-powersystem-project1/](https://jro-d.github.io/marine-powersystem-project1/)**

---

## Quick Visual Legend

| Visual Indicator | Meaning in 3D Vessel & Single-Line Diagram |
| :--- | :--- |
| **Glowing Red Power Line** | **Energized Bus / Feeder Cable** (`6.6 kV` HV, `440 V` LV, `440 V` Emergency, or `220 V` Hotel) |
| **Glowing Yellow Flowing Animation** | **Active Real-Power Flow Direction** from online generator/shore source to running machinery loads |
| **Technical White Net Floor** | Reference grid datum at baseline, replacing legacy ocean waves for optimal machinery visibility |
| **Translucent Hull Shell** | Allows full internal spatial inspection of engine room compartments, tanktop chocks, and decks |
| **Dashed Slate Line** | De-energized feeder cable or busbar section |
| **Dashed Amber Line** | Open circuit breaker / disconnected feeder path |

---

## 1. 3D Vessel Overview & Translucent Machinery Space Inspection

![3D Vessel Overview with Glowing Red Power Lines and Glowing Yellow Flow](public/tutorial/tut_01_overview.png)

When you launch the simulator at **[https://jro-d.github.io/marine-powersystem-project1/](https://jro-d.github.io/marine-powersystem-project1/)**, you enter the **3D Vessel Overview** alongside the **Switchboard Controls** panel (left) and the **Equipment Inspector** (right).

1. **Machinery Compartment Visibility:** The hull's translucent outer shell and technical white net reference floor allow direct visual tracing of internal equipment without visual obstruction.
2. **Trace Energized Feeders:** Any energized cable glows **bright red** while **glowing yellow pulses** travel along the cable from the active power source (`DG 1`–`DG 4`, `Emergency Generator`, or `Shore Power`) toward the connected loads.
3. **Inspect Any Equipment:** Click any 3D equipment model in the vessel (or any node in the Single-Line Diagram) to inspect its live voltage, load (`kW` / `kVAr`), power factor, current (`A`), insulation resistance (`MΩ`), and connected breakers.
4. **Open 3D Universal CAD Assembly:** Click **⚡ Open 3D Engineering Assembly & Specs ↗** at the bottom of the right inspector (or select **Equipment Catalog** in the top bar) to open the unified CAD twin viewer (`universal_viewer.html?eq=<equipment_id>`) for complete parts breakdown and kinematics.

---

## 2. Expandable Simulation Control Console (`⤢ Expand` / Shortcut `E`)

![Expanded 2-Column Simulation Control Console](public/tutorial/tut_02_expanded_console.png)

When running intensive ETO switchboard drills, you can expand the left **Switchboard Controls** drawer into a wide **2-column Simulation Control Console**:

- **Expand / Compact Left Console:** Click **⤢ Expand** in the top-right header of the left panel (or press **`E`** on your keyboard) to widen the control panel from `390 px` to **`680 px`**, placing **Generation & Shore** and **Synchroscope & Paralleling** side-by-side.
- **Hide / Show Left Drawer:** Click **`⇤`** (or press **`[`**) to collapse the left drawer completely when you want an unobstructed view of the 3D hull or Single-Line Diagram.
- **Hide / Show Right Inspector:** Click **Inspector ⇥** in the top-right bar (or press **`]`**) to collapse or reopen the Equipment Inspector.

---

## 3. Interactive Single-Line Diagram (SLD) & Multi-Bus Telemetry

![Interactive Single-Line Diagram with Glowing Red Lines and Yellow Flow](public/tutorial/tut_03_single_line_flow.png)

Click **⌁ Single-line** in the top-center view switcher to open the **IEC 60092 Single-Line Diagram**:

- **Glowing Red Base + Animated Yellow Flow Stream:** Energized feeders render with a glowing red line overlaid with an animated yellow dash stream showing active power delivery across:
  - **6.6 kV Main Switchboard (`BUS A` & `BUS B`)** joined by the **Bus-Tie Vacuum Circuit Breaker (`tie`)**
  - **6.6 kV / 440 V Symmetrical Transformers (`TX A` & `TX B`)** feeding the **440 V Main LV Switchboard**
  - **440 V / 220 V Hotel Transformer** feeding Galley, Accommodation Lighting, and 220 V Service Outlets
  - **440 V SOLAS Emergency Switchboard (`EMERG BUS`)** fed via normal interlocked tie or the automatic Emergency Generator (`EM GEN`)
  - **24 V DC Battery & Static Inverter UPS Bus** supplying uninterrupted power to Wheelhouse Navigation Electronics
- **Pan & Zoom Controls:** Scroll to zoom, drag to pan, or use **⤢ Fit to screen**, **＋**, **－**, and **100%** in the top-right corner of the diagram stage.

---

## 4. Generator Paralleling & Synchroscope Lab (`ANSI 25 / 25A`)

![Synchroscope and Generator Paralleling Lab](public/tutorial/tut_04_synchroscope_parallel.png)

Closing an incoming generator breaker onto a live `6.6 kV` bus out of phase causes severe mechanical shaft torque, alternator winding deformation, and breaker damage. Practice manual and automatic paralleling using Scenario **05 · Parallel & sync DG 2**:

1. **Select Scenario 05 (`Parallel & sync DG 2`):** `DG 1` is online supplying the `6.6 kV` bus, while `DG 2` is running at slightly higher slip frequency (`+0.15 Hz`) with its breaker open (`CB OPEN`).
2. **Observe the Synchroscope Dial:**
   - **Clockwise rotation (`FAST →`):** Incoming generator frequency is higher than bus frequency.
   - **Counter-clockwise rotation (`← SLOW`):** Incoming generator frequency is lower than bus frequency.
   - **12 O'Clock Green Arc (`|Δθ| ≤ 15°`, `|Δf| ≤ 0.35 Hz`):** Safe synchronizing window (`ANSI 25 PERMISSIVE OK`).
3. **Manual Paralleling:**
   - Use **`Gov −`** and **`Gov ＋`** on the generator card to trim incoming frequency until slip is slow and steady (`+0.05 Hz` to `+0.10 Hz`).
   - As the needle approaches **12 o'clock** and the badge turns green (**`ANSI 25 PERMISSIVE OK`**), click **`CB OPEN`** on `DG 2` to close its vacuum breaker!
   - If you attempt to close outside the sync window while **`ANSI 25 ON`** is active, the Check-Synchronizer interlock blocks closure and logs a safety warning.
4. **Automatic Paralleling (`ANSI 25A`):**
   - Click **⚡ Auto-Sync & Close** in the Synchroscope card to watch the PMS automatically trim governor speed, wait for `Δθ ≈ 0°`, close the breaker, and balance active load (`kW`) via speed-droop load sharing.

---

## 5. SOLAS II-1/42 & 43 Navigation Electronics & 24 V DC Battery Bridging

> **Critical Marine Engineering Rule:**
> *When a blackout occurs, do the navigation electronics, radar, and bridge radios stay powered?*
> **YES! Under SOLAS Regulations II-1/42 & 43, vital navigation aids MUST NEVER LOSE POWER.**

1. **Dual Feeds & Static Inverter UPS:**
   - The navigation bridge console is connected to the **440 V Emergency Switchboard (ESB)** under normal conditions through a dedicated dual-rectifier and static inverter UPS.
   - A float-charged **24 V DC Sealed Radio/Nav Battery Bank** floats continuously across the DC busbar.
2. **Zero-Break Battery Bridging During Blackout:**
   - When the main 6.6 kV generators trip, the main and auxiliary buses immediately lose voltage.
   - The 24 V DC battery bank instantly assumes 100% of the navigation load with **zero transfer interruption (0 ms break)**.
   - S-Band Radar (24 RPM), ECDIS chart displays, Gyrocompass, GPS, Navtex, GMDSS VHF/MF Radios, and COLREG Navigation Lights stay fully energized and operational on battery power while the ship is adrift.
3. **Emergency Generator Connection:**
   - Within 10 to 45 seconds of blackout initiation, the autonomous **Emergency Diesel Generator (EDG)** reaches rated speed and voltage.
   - The Automatic Bus Transfer (ABT) switch closes the EDG onto the Emergency Switchboard, restoring AC supply to battery float chargers and secondary steering units without causing any reboot or glitch in bridge navigation equipment!

---

## 6. PMS Protection, Blackout Simulation, Earth Faults & Alarm Logbook

![PMS Fault Injection, Blackout Simulation, and Alarm Logbook](public/tutorial/tut_05_blackout_pms.png)

Scroll to **Propulsion & Sea Load** and **PMS & Fault Simulation** in the left panel (or select Scenario **06 · Heavy sea load & PMS**) to test marine protection relays and casualty recovery:

1. **Propulsion VFD Throttle & Load Sharing:**
   - Drag the **Telegraph / VFD Order** slider (or click **25% Harbor**, **55% Cruise**, **85% Sea**, **108% Flank**) to vary propulsion demand from `0 kW` to `3,000+ kW`.
   - Watch bus frequency droop (`60.8 Hz → 59.5 Hz`) and voltage regulation respond in real time.
2. **Automatic Standby Start (`Auto-Standby >82%`) & Preferential Trip (`Pref. Trip >94%`):**
   - When online generator loading exceeds **82%** for several seconds, the PMS automatically starts the next standby diesel generator, synchronizes it, and closes its breaker.
   - If generator load exceeds **94%**, **Preferential Trip** automatically sheds non-essential hotel/cargo loads (Reefer sub-bus, Galley, Deck Crane, Accommodation outlets) to prevent a main bus blackout.
3. **Blackout & Automated Restoration:**
   - Click **🚨 Simulate Blackout** to trip all main generators and de-energize the `6.6 kV` main switchboard.
   - Observe how navigation electronics remain energized via battery bridging, followed by EDG start.
   - Click **🔄 PMS Auto-Recovery** to execute automated sequential restart of `DG 1`, re-energize the `6.6 kV` and `440 V` buses, and transfer essential loads back to normal supply.
4. **IT Unearthed Insulation Monitoring (`IMD`) & Earth Faults:**
   - Marine high-voltage and 440 V systems operate as **IT unearthed neutral systems** so a single earth fault does not immediately trip essential machinery.
   - Click **⚡ 6.6 kV Earth Fault** or **⚡ 440 V Earth Fault** to simulate insulation degradation (`15.0 MΩ OK` drops to `14 kΩ` or `8 kΩ` fault) and trigger an IMD alarm in the top telemetry bar and **Alarm & PMS Logbook**.

---

## 7. ANSI Protective Relay Engine (`ANSI 32`, `ANSI 40`, `ANSI 51 IDMT`)

![ANSI Protective Relay Engine Telemetry and AVR Trip Control](public/tutorial/tut_06_protective_relays.png)

High-voltage marine power systems demand active numerical protection relays to protect synchronous generators and switchgear against catastrophic electrical and mechanical failures:

1. **ANSI 32 (Reverse Power Protection):**
   - When a paralleled diesel generator's prime mover suffers fuel failure or governor stall, the generator begins drawing active power from the busbar (motoring action).
   - If active power $P < -0.05 \times P_{\text{rated}}$ ($-5\%$) for $> 3.0\text{ s}$, the relay trips the generator vacuum circuit breaker (VCB) with **`ANSI 32: Reverse Power Trip`** to prevent engine crankshaft and gearbox damage.
2. **ANSI 40 (Loss of Field / Excitation Failure):**
   - If an Automatic Voltage Regulator (AVR) malfunctions or rotor field excitation collapses, the generator absorbs high reactive magnetizing power ($Q < -0.20 \times Q_{\text{rated}}$) while bus voltage sags below $85\%$ nominal ($5.61\text{ kV}$).
   - The relay triggers a trip after a $1.5\text{ s}$ timer with **`ANSI 40: Loss of Field`**.
   - Practice this in the simulator using the **AVR / Field Trip** switch on the generator control card.
3. **ANSI 51 (IDMT Inverse-Time Overcurrent Curve):**
   - Instantaneous trips are replaced with the **IEC 60255 Standard Inverse IDMT Curve**:
     $$t = \frac{k}{(I / I_s)^\alpha - 1}$$
     where $k = 0.14$, $\alpha = 0.02$, and pickup threshold $I_s = 1.10 \times I_{\text{rated}}$.
   - Large motor starting currents ride through safely, while severe overloads trip in inverse proportion to current magnitude.

---

## 8. High-Resistance Earthing (HRE) Architecture & ANSI 67N

![High-Resistance Earthing HRE and ANSI 67N Telemetry](public/tutorial/tut_07_hre_earthing.png)

Toggle between earthing configurations in the **PMS & Earthing** panel:

1. **Unearthed IT System vs. High-Resistance Earthing (HRE):**
   - Switch between **"Unearthed IT System"** (zero ground trip current, high charging transients) and **"High-Resistance Earthed (HRE) System"** (modern offshore DP standard).
2. **Neutral Earthing Resistor (NER = 381 Ω):**
   - In HRE mode, the neutral point of each 6.6 kV transformer and generator connects to the vessel's steel hull through a calibrated $381\ \Omega$ resistor bank.
3. **Ground Fault Current Clamped to 10.0 A:**
   - Ground fault current is limited to:
     $$I_{\text{fault}} = \frac{V_{L-N}}{R_{\text{ner}}} = \frac{3,810\text{ V}}{381\ \Omega} = 10.0\text{ A}$$
   - This eliminates arc-flash escalation and iron core burning while maintaining continuous ship operations.
4. **Neutral Displacement & ANSI 67N Directional Ground Fault Alarm:**
   - The neutral point shifts to $V_N = 3,810\text{ V}$, immediately triggering an **`ANSI 67N: Directional Ground Fault Alarm`** in the ETO Alarm Logbook.

---

## 9. SOLAS Blackout Recovery 5-Stage Sequential Waterfall

![SOLAS Blackout Recovery 5-Stage Sequential Waterfall and HUD Progress Bar](public/tutorial/tut_08_solas_waterfall.png)

Under SOLAS Chapter II-1 regulations, restoring all consumers simultaneously causes excessive voltage drop and inrush currents, triggering a second cascading blackout. The simulator executes an automated 5-stage sequential restoration queue:

1. **Stage 1 (T = 0s – 10s) — Emergency DG to ESB:**
   - Emergency Diesel Generator starts within 10 seconds to supply the Emergency Switchboard (ESB): Steering Gear, Navigation Radios, Radar, and Emergency Lighting.
2. **Stage 2 (T = 10s – 20s) — Main DG & Stage 1 Auxiliaries:**
   - Main DG starts, energizes the 6.6 kV bus, and connects Main Engine Lube Oil and Jacket Water Circulating pumps.
3. **Stage 3 (T = 20s – 30s) — Stage 2 Auxiliaries:**
   - Sea Water Cooling and Heavy Fuel Oil (HFO) Booster supply pumps start.
4. **Stage 4 (T = 30s – 45s) — Essential Services:**
   - Starting Air Compressors and Auxiliary Boiler feed pumps restart.
5. **Stage 5 (T > 45s) — Non-Essential & Heavy Loads:**
   - Engine Room Ventilation Fans, Air Conditioning, Cargo Cranes, and Propulsion Thrusters are released.
6. **Dynamic Bottom HUD Progress Bar:**
   - A live progress bar at the bottom of the screen displays real-time stage name, elapsed timer, progress percentage, and load shed status.

---

## 10. Interactive 6.6 kV Permit to Work (PTW) & 5-Step LOTO Flow

![6.6 kV High Voltage Permit to Work PTW and 5-Step LOTO Sequence](public/tutorial/tut_09_hv_loto.png)

In compliance with IEC 60092-503 high-voltage safety standards, inspecting, opening cubicle doors, or exploding 3D CAD assemblies of 6.6 kV equipment requires a mandatory 5-step safety isolation workflow:

1. **Step 1 — Trip & Open Feeder VCB:** Electrically isolate the feeder circuit breaker from the 6.6 kV busbar.
2. **Step 2 — Rack Out VCB Truck to 'Test / Isolated':** Mechanically rack out the draw-out vacuum breaker truck to create a physical air-gap disconnection behind grounded safety shutters.
3. **Step 3 — Apply Padlock & LOTO Danger Tag:** Lock out the racking shutter with a physical padlock and danger tag.
4. **Step 4 — Prove Dead with 6.6 kV Capacitive Wand:** Test conductor terminals with a certified high-voltage test wand (verified on a proving unit before and after testing).
5. **Step 5 — Close Circuit Main Earth (CME) Switch:** Close the mechanical earthing switch to bond all three phases directly to the vessel hull.
6. **Arc-Flash Violation Warning:**
   - If an un-isolated 6.6 kV assembly is opened without completing the 5-step LOTO sequence, the simulator activates a high-voltage **`⚡ ARC-FLASH VIOLATION WARNING`** badge.

---

## 11. Unified Universal CAD Twin Viewer (`universal_viewer.html`)

Access any marine engineering assembly by clicking **Open 3D Engineering Assembly** or visiting `universal_viewer.html?eq=<equipment_id>`:

- **Equipment Switcher:** Select from 18 fully articulated equipment models in the top-right dropdown:
  - `bowThruster`, `propeller`, `propulsionMotor`, `propulsionDrive`, `transformer`, `steeringGear`, `coolingPump`, `firePump`, `ballastPump`, `bilgePump`, `reefer`, `ventFan`, `navBridge`, `eBus`, `battery`, `airCompressor`, `galley440`, `shore`.
- **Interactive BOM Sidebar:** Click any part in the left sidebar to isolate it in the 3D viewport, read its marine alloy material spec, and view its explosion vector.
- **Dynamic 3D Leader Lines:** Callout badges follow camera rotation, drawing crisp SVG lines to part anchors and hiding when parts are unexploded or occluded.
- **Live Kinematics:** Test operational controls directly inside the CAD viewer:
  - **Bow Thruster:** Port / Starboard thrust order, 1200 RPM, and Tunnel Cutaway toggle.
  - **Propeller:** Ahead / Astern order, 110 RPM, Kaplan pitch display.
  - **Steering Gear:** Interactive rudder stock and hydraulic ram helm slider (-35° Port to +35° Stbd).
  - **Radar Scanner:** 24 RPM normal scan, 12 RPM long range, standby mode.

---

## 12. Keyboard Shortcuts Summary

| Shortcut | Action |
| :---: | :--- |
| **`1`** | Switch to **3D Vessel Overview** |
| **`2`** | Switch to **Interactive Single-Line Diagram (SLD)** |
| **`E`** | Toggle Left Panel between **Compact (`390 px`)** and **Expanded 2-Column Console (`680 px`)** |
| **`[`** | Collapse / Open Left **Switchboard Controls** Drawer |
| **`]`** | Collapse / Open Right **Equipment Inspector** Drawer |
| **`R`** | Reset 3D Camera View to Default Position |
| **`Esc`** | Close 3D CAD Assembly / Tutorial Modal or Clear Selection |

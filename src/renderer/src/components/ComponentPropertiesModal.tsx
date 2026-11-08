/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { Node } from 'reactflow'
import {
  type SchematicComponentType,
  type SchematicNodeData,
  getComponentPins,
  type PinDef,
  isDigitalLogicComponent
} from './schematic/SchematicNode'
import { parseAcSourceValue, getGenericSubcktName } from '../utils/spiceNetlist'

interface DeviceUnitOption {
  label: string
  unit: string
}

const DEVICE_UNITS: Record<string, DeviceUnitOption[]> = {
  resistor: [
    { label: 'Ω (Ohms)', unit: 'Ω' },
    { label: 'mΩ (Milliohms)', unit: 'mΩ' },
    { label: 'kΩ (Kilohms)', unit: 'kΩ' },
    { label: 'MΩ (Megaohms)', unit: 'MΩ' },
    { label: 'GΩ (Gigaohms)', unit: 'GΩ' }
  ],
  capacitor: [
    { label: 'pF (Picofarads)', unit: 'pF' },
    { label: 'nF (Nanofarads)', unit: 'nF' },
    { label: 'µF (Microfarads)', unit: 'µF' },
    { label: 'mF (Millifarads)', unit: 'mF' },
    { label: 'F (Farads)', unit: 'F' }
  ],
  inductor: [
    { label: 'pH (Picohenries)', unit: 'pH' },
    { label: 'nH (Nanohenries)', unit: 'nH' },
    { label: 'µH (Microhenries)', unit: 'µH' },
    { label: 'mH (Millihenries)', unit: 'mH' },
    { label: 'H (Henries)', unit: 'H' }
  ],
  potentiometer: [
    { label: 'kΩ (Kilohms)', unit: 'kΩ' },
    { label: 'Ω (Ohms)', unit: 'Ω' },
    { label: 'MΩ (Megaohms)', unit: 'MΩ' }
  ],
  transformer: [
    { label: '1:1 (Coupling)', unit: '1:1' },
    { label: '2:1 (Step Down)', unit: '2:1' },
    { label: '1:2 (Step Up)', unit: '1:2' },
    { label: '10:1 (Power Step Down)', unit: '10:1' },
    { label: 'Custom Ratio', unit: 'Custom' }
  ],
  'coupled-inductor': [
    { label: 'K1 L1 L2 0.99 (Tight)', unit: 'K1 L1 L2 0.99' },
    { label: 'K1 L1 L2 0.95 (Standard)', unit: 'K1 L1 L2 0.95' },
    { label: 'K1 L1 L2 1.0 (Ideal)', unit: 'K1 L1 L2 1.0' },
    { label: 'Custom Coupling', unit: 'Custom' }
  ],
  'transmission-line': [
    { label: '50Ω 1ns Delay', unit: 'Z0=50 TD=1n' },
    { label: '75Ω 1ns Delay', unit: 'Z0=75 TD=1n' },
    { label: '50Ω 5ns Delay', unit: 'Z0=50 TD=5n' },
    { label: 'Custom Line', unit: 'Custom' }
  ],
  'voltage-source': [
    { label: 'V (Volts)', unit: 'V' },
    { label: 'mV (Millivolts)', unit: 'mV' },
    { label: 'kV (Kilovolts)', unit: 'kV' },
    { label: 'µV (Microvolts)', unit: 'µV' }
  ],
  vcc: [
    { label: '+5V (TTL / Logic)', unit: '+5V' },
    { label: '+3.3V (LVTTL)', unit: '+3.3V' },
    { label: '+12V (Analog Rail)', unit: '+12V' },
    { label: '+15V (Op-Amp Rail)', unit: '+15V' },
    { label: '-5V (Negative)', unit: '-5V' },
    { label: '-12V (Negative)', unit: '-12V' },
    { label: 'Custom Voltage', unit: 'Custom' }
  ],
  'current-source': [
    { label: 'mA (Milliamps)', unit: 'mA' },
    { label: 'A (Amps)', unit: 'A' },
    { label: 'µA (Microamps)', unit: 'µA' },
    { label: 'nA (Nanoamps)', unit: 'nA' }
  ],
  'ac-source': [
    { label: 'V (Volts)', unit: 'V' },
    { label: 'mV (Millivolts)', unit: 'mV' },
    { label: 'kV (Kilovolts)', unit: 'kV' },
    { label: 'µV (Microvolts)', unit: 'µV' }
  ],
  'pulse-source': [
    { label: 'PULSE 0V to 5V (10µs/20µs)', unit: 'PULSE(0 5 0 1n 1n 10u 20u)' },
    { label: 'PULSE 0V to 3.3V (1ms/2ms)', unit: 'PULSE(0 3.3 0 10n 10n 1m 2m)' },
    { label: 'PULSE 0V to 1V (500ps/1ns)', unit: 'PULSE(0 1 0 1p 1p 500p 1n)' },
    { label: 'Custom Pulse Expression', unit: 'Custom' }
  ],
  vcvs: [
    { label: 'Gain 1.0 (Unity)', unit: '1.0' },
    { label: 'Gain 2.0 (x2)', unit: '2.0' },
    { label: 'Gain 5.0 (x5)', unit: '5.0' },
    { label: 'Gain 10.0 (x10)', unit: '10.0' },
    { label: 'Gain 100.0 (x100)', unit: '100.0' },
    { label: 'Custom Gain', unit: 'Custom' }
  ],
  vccs: [
    { label: '1m (1 mS / mA per V)', unit: '1m' },
    { label: '10m (10 mS)', unit: '10m' },
    { label: '100m (100 mS)', unit: '100m' },
    { label: '1u (1 µS)', unit: '1u' },
    { label: 'Custom Transconductance', unit: 'Custom' }
  ],
  cccs: [
    { label: 'Gain 1.0 (Unity)', unit: '1.0' },
    { label: 'Gain 2.0 (x2)', unit: '2.0' },
    { label: 'Gain 5.0 (x5)', unit: '5.0' },
    { label: 'Gain 10.0 (x10)', unit: '10.0' },
    { label: 'Custom Current Gain', unit: 'Custom' }
  ],
  ccvs: [
    { label: '1k (1 kΩ / V per mA)', unit: '1k' },
    { label: '10k (10 kΩ)', unit: '10k' },
    { label: '100k (100 kΩ)', unit: '100k' },
    { label: '100 (100 Ω)', unit: '100' },
    { label: 'Custom Transresistance', unit: 'Custom' }
  ],
  'behavioral-source': [
    { label: 'V = V(in)*2 (Amplifier)', unit: 'V=V(in)*2' },
    { label: 'I = I(in)*1.5 (Scale)', unit: 'I=I(in)*1.5' },
    { label: 'V = sin(2*pi*1k*time)', unit: 'V=sin(2*pi*1000*time)' },
    { label: 'Custom B-Expression', unit: 'Custom' }
  ],
  diode: [
    { label: '1N4148 (Fast Signal)', unit: '1N4148' },
    { label: '1N4007 (1A Rectifier)', unit: '1N4007' },
    { label: '1N5819 (Schottky)', unit: '1N5819' },
    { label: 'BAT54 (Small-Signal)', unit: 'BAT54' },
    { label: 'Custom Diode Model', unit: 'Custom' }
  ],
  'zener-diode': [
    { label: 'BZX84C5V1 (5.1V Zener)', unit: 'BZX84C5V1' },
    { label: 'BZX84C3V3 (3.3V Zener)', unit: 'BZX84C3V3' },
    { label: 'BZX84C12V (12V Zener)', unit: 'BZX84C12V' },
    { label: '1N4733A (5.1V 1W)', unit: '1N4733A' },
    { label: 'Custom Zener Model', unit: 'Custom' }
  ],
  'schottky-diode': [
    { label: '1N5819 (1A 40V Schottky)', unit: '1N5819' },
    { label: 'BAT54 (Small Signal)', unit: 'BAT54' },
    { label: 'MBR0520 (0.5A 20V)', unit: 'MBR0520' },
    { label: 'Custom Schottky Model', unit: 'Custom' }
  ],
  led: [
    { label: 'RED LED (1.8V)', unit: 'RED' },
    { label: 'GREEN LED (2.1V)', unit: 'GREEN' },
    { label: 'BLUE LED (3.2V)', unit: 'BLUE' },
    { label: 'YELLOW LED (2.0V)', unit: 'YELLOW' },
    { label: 'WHITE LED (3.3V)', unit: 'WHITE' },
    { label: 'Custom LED', unit: 'Custom' }
  ],
  'npn-bjt': [
    { label: '2N2222 (General NPN)', unit: '2N2222' },
    { label: '2N3904 (Switching NPN)', unit: '2N3904' },
    { label: 'BC547B (Low Noise)', unit: 'BC547B' },
    { label: '2N3055 (Power NPN)', unit: '2N3055' },
    { label: 'BD139 (Medium Power)', unit: 'BD139' },
    { label: 'Custom NPN Model', unit: 'Custom' }
  ],
  'pnp-bjt': [
    { label: '2N2907 (General PNP)', unit: '2N2907' },
    { label: '2N3906 (Switching PNP)', unit: '2N3906' },
    { label: 'BC557B (Low Noise)', unit: 'BC557B' },
    { label: 'BD140 (Medium Power)', unit: 'BD140' },
    { label: 'Custom PNP Model', unit: 'Custom' }
  ],
  nmos: [
    { label: 'NMOS (Generic SPICE Model)', unit: 'NMOS' },
    { label: '2N7000 (Small Signal)', unit: '2N7000' },
    { label: 'IRF540 (Power NMOS 100V)', unit: 'IRF540' },
    { label: 'BS170 (Switching NMOS)', unit: 'BS170' },
    { label: 'IRFZ44N (Power NMOS 55V)', unit: 'IRFZ44N' },
    { label: 'NMOS_180N (180nm CMOS BSIM3)', unit: 'NMOS_180N' },
    { label: 'NMOS_45N (45nm PTM BSIM4)', unit: 'NMOS_45N' },
    { label: 'NMOS_3U (3µm Educational)', unit: 'NMOS_3U' },
    { label: 'Custom NMOS Model', unit: 'Custom' }
  ],
  pmos: [
    { label: 'PMOS (Generic SPICE Model)', unit: 'PMOS' },
    { label: 'IRF9530 (Power PMOS)', unit: 'IRF9530' },
    { label: 'BS250 (Small Signal PMOS)', unit: 'BS250' },
    { label: 'VP2106 (Low Threshold)', unit: 'VP2106' },
    { label: 'PMOS_180N (180nm CMOS BSIM3)', unit: 'PMOS_180N' },
    { label: 'PMOS_45N (45nm PTM BSIM4)', unit: 'PMOS_45N' },
    { label: 'PMOS_3U (3µm Educational)', unit: 'PMOS_3U' },
    { label: 'Custom PMOS Model', unit: 'Custom' }
  ],
  'jfet-n': [
    { label: '2N5457 (General N-JFET)', unit: '2N5457' },
    { label: '2N3819 (RF N-JFET)', unit: '2N3819' },
    { label: 'J310 (VHF/UHF N-JFET)', unit: 'J310' },
    { label: 'BF245A (Audio/RF)', unit: 'BF245A' },
    { label: 'Custom N-JFET Model', unit: 'Custom' }
  ],
  'jfet-p': [
    { label: '2N5460 (General P-JFET)', unit: '2N5460' },
    { label: 'J270 (Audio P-JFET)', unit: 'J270' },
    { label: '2N3993 (RF P-JFET)', unit: '2N3993' },
    { label: 'Custom P-JFET Model', unit: 'Custom' }
  ],
  opamp: [
    { label: 'LM741 (General Op-Amp)', unit: 'LM741' },
    { label: 'TL072 (Low Noise JFET)', unit: 'TL072' },
    { label: 'OP07 (Precision Low-Offset)', unit: 'OP07' },
    { label: 'NE5532 (Audio Op-Amp)', unit: 'NE5532' },
    { label: 'LM358 (Dual Low Power)', unit: 'LM358' },
    { label: 'AD823 (Rail-to-Rail FET)', unit: 'AD823' },
    { label: 'Custom Op-Amp Model', unit: 'Custom' }
  ],
  comparator: [
    { label: 'LM741 (General Purpose)', unit: 'LM741' },
    { label: 'LM393 (Dual Precision)', unit: 'LM393' },
    { label: 'LM311 (High Speed Strobe)', unit: 'LM311' },
    { label: 'LM339 (Quad Low Power)', unit: 'LM339' },
    { label: 'Custom Comparator', unit: 'Custom' }
  ],
  'timer-555': [
    { label: 'NE555 (Standard Bipolar)', unit: 'NE555' },
    { label: 'LM555 (General Purpose)', unit: 'LM555' },
    { label: 'TLC555 (Low Power CMOS)', unit: 'TLC555' },
    { label: 'Custom 555 Model', unit: 'Custom' }
  ],
  'voltage-regulator': [
    { label: 'LM7805 (+5V Linear)', unit: 'LM7805' },
    { label: 'LM7812 (+12V Linear)', unit: 'LM7812' },
    { label: 'LM7815 (+15V Linear)', unit: 'LM7815' },
    { label: 'LM7905 (-5V Negative)', unit: 'LM7905' },
    { label: 'LM317 (Adjustable)', unit: 'LM317' },
    { label: 'Custom Regulator', unit: 'Custom' }
  ],
  switch: [
    { label: 'SW (Standard SPST)', unit: 'SW' },
    { label: 'SW_NO (Normally Open)', unit: 'SW_NO' },
    { label: 'SW_NC (Normally Closed)', unit: 'SW_NC' },
    { label: 'Custom Switch Model', unit: 'Custom' }
  ],
  'gate-and': [
    { label: '74HC08 (Quad 2-Input AND)', unit: '74HC08' },
    { label: '74LS08 (Schottky AND)', unit: '74LS08' },
    { label: 'CD4081 (CMOS AND)', unit: '4081' },
    { label: 'Custom AND Gate', unit: 'Custom' }
  ],
  'gate-or': [
    { label: '74HC32 (Quad 2-Input OR)', unit: '74HC32' },
    { label: '74LS32 (Schottky OR)', unit: '74LS32' },
    { label: 'CD4071 (CMOS OR)', unit: '4071' },
    { label: 'Custom OR Gate', unit: 'Custom' }
  ],
  'gate-not': [
    { label: '74HC04 (Hex Inverter)', unit: '74HC04' },
    { label: '74LS04 (Schottky Inverter)', unit: '74LS04' },
    { label: 'CD4069 (CMOS Inverter)', unit: '4069' },
    { label: 'Custom NOT Gate', unit: 'Custom' }
  ],
  'gate-nand': [
    { label: '74HC00 (Quad 2-Input NAND)', unit: '74HC00' },
    { label: '74LS00 (Schottky NAND)', unit: '74LS00' },
    { label: 'CD4011 (CMOS NAND)', unit: '4011' },
    { label: 'Custom NAND Gate', unit: 'Custom' }
  ],
  'gate-nor': [
    { label: '74HC02 (Quad 2-Input NOR)', unit: '74HC02' },
    { label: '74LS02 (Schottky NOR)', unit: '74LS02' },
    { label: 'CD4001 (CMOS NOR)', unit: '4001' },
    { label: 'Custom NOR Gate', unit: 'Custom' }
  ],
  'gate-xor': [
    { label: '74HC86 (Quad 2-Input XOR)', unit: '74HC86' },
    { label: '74LS86 (Schottky XOR)', unit: '74LS86' },
    { label: 'CD4070 (CMOS XOR)', unit: '4070' },
    { label: 'Custom XOR Gate', unit: 'Custom' }
  ],
  'gate-xnor': [
    { label: '74HC266 (Quad 2-Input XNOR)', unit: '74HC266' },
    { label: '74LS266 (Schottky XNOR)', unit: '74LS266' },
    { label: 'CD4077 (CMOS XNOR)', unit: '4077' },
    { label: 'Custom XNOR Gate', unit: 'Custom' }
  ],
  'flipflop-d': [
    { label: '74HC74 (Dual D Flip-Flop)', unit: '74HC74' },
    { label: '74LS74 (Schottky D-FF)', unit: '74LS74' },
    { label: 'CD4013 (CMOS D-FF)', unit: '4013' },
    { label: 'Custom D-FF', unit: 'Custom' }
  ],
  'flipflop-jk': [
    { label: '74HC73 (Dual JK Flip-Flop)', unit: '74HC73' },
    { label: '74LS73 (Schottky JK-FF)', unit: '74LS73' },
    { label: '74HC76 (JK with Preset/Clear)', unit: '74HC76' },
    { label: 'Custom JK-FF', unit: 'Custom' }
  ],
  'mux-2to1': [
    { label: '74HC157 (Quad 2:1 MUX)', unit: '74HC157' },
    { label: '74LS157 (Schottky 2:1 MUX)', unit: '74LS157' },
    { label: 'Custom MUX', unit: 'Custom' }
  ],
  'counter-4bit': [
    { label: '74HC161 (Sync 4-Bit Counter)', unit: '74HC161' },
    { label: '74HC163 (Sync Reset Counter)', unit: '74HC163' },
    { label: '74LS90 (Decade Counter)', unit: '74LS90' },
    { label: 'Custom Counter', unit: 'Custom' }
  ],
  generic: [
    { label: '— (None)', unit: '' },
    { label: 'k (Kilo)', unit: 'k' },
    { label: 'M (Mega)', unit: 'M' },
    { label: 'm (Milli)', unit: 'm' },
    { label: 'u (Micro)', unit: 'u' },
    { label: 'n (Nano)', unit: 'n' },
    { label: 'p (Pico)', unit: 'p' },
    { label: 'V (Volts)', unit: 'V' },
    { label: 'A (Amps)', unit: 'A' },
    { label: 'Hz (Hertz)', unit: 'Hz' }
  ]
}

export const MODEL_COMPONENTS = new Set<SchematicComponentType>([
  'diode',
  'zener-diode',
  'schottky-diode',
  'led',
  'npn-bjt',
  'pnp-bjt',
  'nmos',
  'pmos',
  'jfet-n',
  'jfet-p',
  'opamp',
  'comparator',
  'timer-555',
  'voltage-regulator',
  'switch',
  'gate-and',
  'gate-or',
  'gate-not',
  'gate-nand',
  'gate-nor',
  'gate-xor',
  'gate-xnor',
  'flipflop-d',
  'flipflop-jk',
  'mux-2to1',
  'counter-4bit',
  'pulse-source',
  'coupled-inductor',
  'transmission-line',
  'vcvs',
  'vccs',
  'cccs',
  'ccvs',
  'behavioral-source',
  'vcc'
])

function parseComponentValue(
  type: SchematicComponentType,
  fullValue: string = ''
): { magnitude: string; unit: string } {
  const units = DEVICE_UNITS[type] || DEVICE_UNITS.generic
  const trimmed = (fullValue ?? '').trim()

  if (MODEL_COMPONENTS.has(type)) {
    const known = units.find((u) => u.unit.toLowerCase() === trimmed.toLowerCase())
    if (known) {
      return { magnitude: '', unit: known.unit }
    }
    return { magnitude: trimmed, unit: 'Custom' }
  }

  if (!trimmed) {
    const defaultUnit =
      type === 'resistor' || type === 'potentiometer'
        ? 'kΩ'
        : type === 'capacitor'
          ? 'µF'
          : type === 'inductor'
            ? 'mH'
            : type === 'voltage-source' || type === 'ac-source'
              ? 'V'
              : type === 'current-source'
                ? 'mA'
                : (units[0]?.unit ?? '')
    return {
      magnitude: type === 'voltage-source' ? '5' : type === 'ac-source' ? '1' : '',
      unit: defaultUnit
    }
  }

  const numMatch = trimmed.match(/^([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*(.*)$/)
  if (!numMatch) {
    return { magnitude: trimmed, unit: units[0]?.unit ?? '' }
  }

  const mag = numMatch[1]
  const suffix = numMatch[2].trim()

  if (!suffix) {
    const defaultUnit =
      type === 'resistor' || type === 'potentiometer'
        ? 'kΩ'
        : type === 'capacitor'
          ? 'µF'
          : type === 'inductor'
            ? 'mH'
            : type === 'voltage-source' || type === 'ac-source'
              ? 'V'
              : type === 'current-source'
                ? 'mA'
                : (units[0]?.unit ?? '')
    return { magnitude: mag, unit: defaultUnit }
  }

  const sLower = suffix.toLowerCase()
  let matched = units.find(
    (u) =>
      u.unit.toLowerCase() === sLower || u.unit.replace(/Ω|H|F|V|A/g, '').toLowerCase() === sLower
  )

  if (!matched) {
    if (type === 'resistor' || type === 'potentiometer') {
      if (sLower === 'k' || sLower === 'kohm' || sLower === 'kω')
        matched = units.find((u) => u.unit === 'kΩ')
      else if (sLower === 'm' || sLower === 'mohm' || sLower === 'mω')
        matched = units.find((u) => u.unit === 'mΩ')
      else if (sLower === 'meg' || sLower === 'megohm') matched = units.find((u) => u.unit === 'MΩ')
      else if (sLower === 'g' || sLower === 'gohm' || sLower === 'gω')
        matched = units.find((u) => u.unit === 'GΩ')
      else if (sLower === 'r' || sLower === 'ohm' || sLower === 'ohms' || sLower === 'ω')
        matched = units.find((u) => u.unit === 'Ω')
    } else if (type === 'capacitor') {
      if (sLower === 'u' || sLower === 'uf' || sLower === 'µ' || sLower === 'µf')
        matched = units.find((u) => u.unit === 'µF')
      else if (sLower === 'p' || sLower === 'pf') matched = units.find((u) => u.unit === 'pF')
      else if (sLower === 'n' || sLower === 'nf') matched = units.find((u) => u.unit === 'nF')
      else if (sLower === 'm' || sLower === 'mf') matched = units.find((u) => u.unit === 'mF')
      else if (sLower === 'f') matched = units.find((u) => u.unit === 'F')
    } else if (type === 'inductor') {
      if (sLower === 'u' || sLower === 'uh' || sLower === 'µ' || sLower === 'µh')
        matched = units.find((u) => u.unit === 'µH')
      else if (sLower === 'n' || sLower === 'nh') matched = units.find((u) => u.unit === 'nH')
      else if (sLower === 'm' || sLower === 'mh') matched = units.find((u) => u.unit === 'mH')
      else if (sLower === 'p' || sLower === 'ph') matched = units.find((u) => u.unit === 'pH')
      else if (sLower === 'h') matched = units.find((u) => u.unit === 'H')
    } else if (type === 'voltage-source' || type === 'ac-source') {
      if (sLower === 'v') matched = units.find((u) => u.unit === 'V')
      else if (sLower === 'mv') matched = units.find((u) => u.unit === 'mV')
      else if (sLower === 'kv') matched = units.find((u) => u.unit === 'kV')
      else if (sLower === 'uv' || sLower === 'µv') matched = units.find((u) => u.unit === 'µV')
    } else if (type === 'current-source') {
      if (sLower === 'ma') matched = units.find((u) => u.unit === 'mA')
      else if (sLower === 'a') matched = units.find((u) => u.unit === 'A')
      else if (sLower === 'ua' || sLower === 'µa') matched = units.find((u) => u.unit === 'µA')
      else if (sLower === 'na') matched = units.find((u) => u.unit === 'nA')
    }
  }

  return {
    magnitude: mag,
    unit: matched ? matched.unit : (units[0]?.unit ?? '')
  }
}

function formatComponentValue(
  type: SchematicComponentType,
  magnitude: string,
  unit: string
): string {
  if (MODEL_COMPONENTS.has(type)) {
    if (unit === 'Custom') return magnitude
    return unit
  }
  const cleanMag = magnitude.trim()
  if (!cleanMag) return ''
  return `${cleanMag}${unit}`
}

function getFriendlyTypeName(type: SchematicComponentType | 'junction'): string {
  switch (type) {
    case 'resistor':
      return 'Resistor'
    case 'capacitor':
      return 'Capacitor'
    case 'inductor':
      return 'Inductor'
    case 'potentiometer':
      return 'Potentiometer'
    case 'transformer':
      return 'Transformer'
    case 'coupled-inductor':
      return 'Coupled Inductor'
    case 'transmission-line':
      return 'Transmission Line'
    case 'voltage-source':
      return 'DC Voltage Source'
    case 'current-source':
      return 'DC Current Source'
    case 'ac-source':
      return 'AC Voltage Source'
    case 'pulse-source':
      return 'Pulse Voltage Source'
    case 'vcvs':
      return 'VCVS (Voltage-Controlled Voltage Source)'
    case 'vccs':
      return 'VCCS (Voltage-Controlled Current Source)'
    case 'cccs':
      return 'CCCS (Current-Controlled Current Source)'
    case 'ccvs':
      return 'CCVS (Current-Controlled Voltage Source)'
    case 'behavioral-source':
      return 'Behavioral Source (B)'
    case 'ground':
      return 'Ground (0V Reference)'
    case 'vcc':
      return 'Power Supply (VCC)'
    case 'diode':
      return 'Diode'
    case 'zener-diode':
      return 'Zener Diode'
    case 'schottky-diode':
      return 'Schottky Diode'
    case 'led':
      return 'Light Emitting Diode (LED)'
    case 'npn-bjt':
      return 'NPN Bipolar Transistor (BJT)'
    case 'pnp-bjt':
      return 'PNP Bipolar Transistor (BJT)'
    case 'nmos':
      return 'N-Channel MOSFET'
    case 'pmos':
      return 'P-Channel MOSFET'
    case 'jfet-n':
      return 'N-Channel JFET'
    case 'jfet-p':
      return 'P-Channel JFET'
    case 'opamp':
      return 'Operational Amplifier'
    case 'comparator':
      return 'Voltage Comparator'
    case 'timer-555':
      return '555 Timer IC'
    case 'voltage-regulator':
      return 'Voltage Regulator'
    case 'switch':
      return 'SPST Switch'
    case 'gate-and':
      return 'AND Gate'
    case 'gate-or':
      return 'OR Gate'
    case 'gate-not':
      return 'NOT Gate (Inverter)'
    case 'gate-nand':
      return 'NAND Gate'
    case 'gate-nor':
      return 'NOR Gate'
    case 'gate-xor':
      return 'XOR Gate'
    case 'gate-xnor':
      return 'XNOR Gate'
    case 'flipflop-d':
      return 'D Flip-Flop'
    case 'flipflop-jk':
      return 'JK Flip-Flop'
    case 'mux-2to1':
      return '2:1 Multiplexer'
    case 'counter-4bit':
      return '4-Bit Binary Counter'
    case 'net-label':
      return 'Net Label'
    case 'port-in':
      return 'Input Port'
    case 'port-out':
      return 'Output Port'
    case 'port-bi':
      return 'Bi-directional Port'
    case 'spice-directive':
      return 'SPICE Directive'
    case 'schematic-text':
      return 'Text Annotation'
    case 'junction':
      return 'Junction Dot'
    default:
      return type
  }
}

function getComponentCategory(type: SchematicComponentType | 'junction'): string {
  if (type === 'junction') return 'Wiring'
  if (
    type === 'ground' ||
    type === 'vcc' ||
    type === 'net-label' ||
    type === 'port-in' ||
    type === 'port-out' ||
    type === 'port-bi'
  ) {
    return 'Power & Ports'
  }
  if (type === 'spice-directive' || type === 'schematic-text') {
    return 'Directives & Annotations'
  }
  if (
    type === 'resistor' ||
    type === 'capacitor' ||
    type === 'inductor' ||
    type === 'potentiometer' ||
    type === 'transformer' ||
    type === 'coupled-inductor' ||
    type === 'transmission-line'
  ) {
    return 'Passive Devices'
  }
  if (
    type === 'voltage-source' ||
    type === 'current-source' ||
    type === 'ac-source' ||
    type === 'pulse-source' ||
    type === 'vcvs' ||
    type === 'vccs' ||
    type === 'cccs' ||
    type === 'ccvs' ||
    type === 'behavioral-source'
  ) {
    return 'Sources & Generators'
  }
  if (
    type === 'diode' ||
    type === 'zener-diode' ||
    type === 'schottky-diode' ||
    type === 'led' ||
    type === 'npn-bjt' ||
    type === 'pnp-bjt' ||
    type === 'nmos' ||
    type === 'pmos' ||
    type === 'jfet-n' ||
    type === 'jfet-p'
  ) {
    return 'Semiconductors'
  }
  return 'Integrated Circuits & Logic'
}

interface ComponentPropertiesModalProps {
  isOpen: boolean
  node: Node<SchematicNodeData> | null
  onClose: () => void
  onApply: (
    nodeId: string,
    updates: {
      label?: string
      value?: string
      rotation?: number
      type?: SchematicComponentType
      directiveType?: 'spice' | 'comment'
      portType?: 'none' | 'input' | 'output' | 'bidirectional'
      properties?: Record<string, unknown>
    }
  ) => void
  pinNetMap?: Record<string, string>
}

export const ComponentPropertiesModal: React.FC<ComponentPropertiesModalProps> = ({
  isOpen,
  node,
  onClose,
  onApply,
  pinNetMap = {}
}) => {
  const { t } = useTranslation()
  const compType = (node?.data?.type || (node?.type === 'junction' ? 'junction' : 'generic')) as
    SchematicComponentType | 'junction'

  // Local draft states
  const [label, setLabel] = useState('')
  const [magnitude, setMagnitude] = useState('')
  const [unit, setUnit] = useState('')
  const [acPhase, setAcPhase] = useState('0')
  const [customModel, setCustomModel] = useState('')
  const [rotation, setRotation] = useState<number>(0)
  const [isDirty, setIsDirty] = useState(false)

  // Directives, text and ports states
  const [directiveText, setDirectiveText] = useState('')
  const [directiveType, setDirectiveType] = useState<'spice' | 'comment'>('spice')
  const [netName, setNetName] = useState('')

  // MOSFET electrical sizing states
  const [mosW, setMosW] = useState('10u')
  const [mosL, setMosL] = useState('1u')
  const [mosM, setMosM] = useState('1')
  const [mosBulk, setMosBulk] = useState('source')
  const [mosBulkNet, setMosBulkNet] = useState('')
  const [mosAD, setMosAD] = useState('')
  const [mosAS, setMosAS] = useState('')
  const [mosPD, setMosPD] = useState('')
  const [mosPS, setMosPS] = useState('')

  // Resistor electrical states
  const [resTol, setResTol] = useState('')
  const [resTc1, setResTc1] = useState('')
  const [resTc2, setResTc2] = useState('')
  const [resTemp, setResTemp] = useState('')
  const [resM, setResM] = useState('1')

  // Capacitor electrical states
  const [capIc, setCapIc] = useState('')
  const [capRser, setCapRser] = useState('')
  const [capM, setCapM] = useState('1')

  // Inductor electrical states
  const [indIc, setIndIc] = useState('')
  const [indRser, setIndRser] = useState('')
  const [indM, setIndM] = useState('1')

  // Diode electrical states
  const [diodeArea, setDiodeArea] = useState('1')
  const [diodeM, setDiodeM] = useState('1')
  const [diodeIc, setDiodeIc] = useState('')
  const [diodeOff, setDiodeOff] = useState(false)

  // BJT electrical states
  const [bjtArea, setBjtArea] = useState('1')
  const [bjtM, setBjtM] = useState('1')
  const [bjtIc, setBjtIc] = useState('')
  const [bjtOff, setBjtOff] = useState(false)

  // Initialize draft when node opens or changes
  useEffect(() => {
    if (!node || !isOpen) return

    const initialLabel = node.data?.label || node.id || ''
    setLabel(initialLabel)

    const initialRotation = node.data?.rotation ?? 0
    setRotation(initialRotation)

    const rawVal = node.data?.value ?? ''
    const devProps = node.data?.properties || {}

    // Initialize MOSFET sizing
    const isSubmicron = rawVal.includes('180') || rawVal.includes('45')
    setMosW(devProps.w || (isSubmicron ? '1.8u' : '10u'))
    setMosL(devProps.l || (isSubmicron ? '0.18u' : '1u'))
    setMosM(devProps.m || '1')
    setMosBulk(devProps.bulk || 'source')
    setMosBulkNet(devProps.bulkNet || '')
    setMosAD(devProps.ad || '')
    setMosAS(devProps.as || '')
    setMosPD(devProps.pd || '')
    setMosPS(devProps.ps || '')

    // Initialize Passives
    setResTol(devProps.tol || '')
    setResTc1(devProps.tc1 || '')
    setResTc2(devProps.tc2 || '')
    setResTemp(devProps.temp || '')
    setResM(devProps.m || '1')

    setCapIc(devProps.ic || '')
    setCapRser(devProps.rser || '')
    setCapM(devProps.m || '1')

    setIndIc(devProps.ic || '')
    setIndRser(devProps.rser || '')
    setIndM(devProps.m || '1')

    // Initialize Diodes & BJTs
    setDiodeArea(devProps.area || '1')
    setDiodeM(devProps.m || '1')
    setDiodeIc(devProps.ic || '')
    setDiodeOff(Boolean(devProps.off))

    setBjtArea(devProps.area || '1')
    setBjtM(devProps.m || '1')
    setBjtIc(devProps.ic || '')
    setBjtOff(Boolean(devProps.off))

    if (compType === 'spice-directive') {
      setDirectiveText(rawVal || '.op')
      setDirectiveType(
        node.data?.directiveType ||
          (rawVal.startsWith('*') || rawVal.startsWith(';') ? 'comment' : 'spice')
      )
    } else if (compType === 'schematic-text') {
      setDirectiveText(rawVal || initialLabel || 'Annotation')
    } else if (
      compType === 'net-label' ||
      compType === 'port-in' ||
      compType === 'port-out' ||
      compType === 'port-bi'
    ) {
      setNetName(rawVal || initialLabel || 'NET1')
    } else if (compType === 'ac-source') {
      const parsed = parseAcSourceValue(rawVal)
      setMagnitude(parsed.amplitude || '1')
      setUnit(parsed.unit || 'V')
      setAcPhase(parsed.phase || '0')
      setCustomModel('')
    } else if (compType === 'voltage-source') {
      const parsed = parseComponentValue('voltage-source', rawVal)
      setMagnitude(parsed.magnitude || '5')
      setUnit(parsed.unit || 'V')
      setCustomModel('')
    } else if (compType !== 'junction' && compType !== 'ground') {
      const parsed = parseComponentValue(compType as SchematicComponentType, rawVal)
      setMagnitude(parsed.magnitude)
      setUnit(parsed.unit)
      if (MODEL_COMPONENTS.has(compType as SchematicComponentType)) {
        setCustomModel(rawVal)
      } else {
        setCustomModel('')
      }
    } else {
      setMagnitude('')
      setUnit('')
      setAcPhase('0')
      setCustomModel('')
    }

    setIsDirty(false)
  }, [node, isOpen, compType])

  // Compute final value string
  const computedValue = useMemo(() => {
    if (compType === 'junction' || compType === 'ground') return ''
    if (compType === 'ac-source') {
      const cleanAmp = magnitude.trim() || '1'
      const cleanUnit = unit || 'V'
      const cleanPhase = acPhase.trim() || '0'
      return `AC ${cleanAmp}${cleanUnit} ${cleanPhase}°`
    }
    const scType = compType as SchematicComponentType
    if (MODEL_COMPONENTS.has(scType)) {
      if (unit === 'Custom') {
        return customModel.trim()
      }
      return unit || customModel.trim()
    }
    return formatComponentValue(scType, magnitude, unit)
  }, [compType, magnitude, unit, acPhase, customModel])

  // Live SPICE Card Preview
  const liveSpiceCard = useMemo(() => {
    if (compType === 'nmos' || compType === 'pmos') {
      const p = label.trim() || (compType === 'nmos' ? 'M1' : 'M2')
      const prefix = p.startsWith('M') ? p : `M${p}`
      const mod =
        unit === 'Custom'
          ? customModel.trim() || (compType === 'nmos' ? '2N7000' : 'IRF9530')
          : unit || (compType === 'nmos' ? '2N7000' : 'IRF9530')
      let b = 'B'
      if (mosBulk === 'ground') {
        b = '0'
      } else if (mosBulk === 'vcc' || mosBulk === 'vdd') {
        b = 'VCC'
      } else if (mosBulk === 'custom' && mosBulkNet.trim()) {
        b = mosBulkNet.trim()
      } else if (mosBulk === 'source') {
        b = 'S'
      } else {
        b = 'B'
      }
      let card = `${prefix} D G S ${b} ${mod} W=${mosW.trim() || '10u'} L=${mosL.trim() || '1u'}`
      if (mosM.trim() && mosM.trim() !== '1') card += ` M=${mosM.trim()}`
      return card
    }
    if (compType === 'resistor') {
      const p = label.trim() || 'R1'
      const prefix = p.startsWith('R') ? p : `R${p}`
      let card = `${prefix} N1 N2 ${computedValue || '1k'}`
      if (resTol) card += ` tol=${resTol}`
      if (resTc1) card += resTc2 ? ` tc=${resTc1},${resTc2}` : ` tc=${resTc1}`
      if (resTemp) card += ` temp=${resTemp}`
      if (resM && resM !== '1') card += ` m=${resM}`
      return card
    }
    if (compType === 'capacitor') {
      const p = label.trim() || 'C1'
      const prefix = p.startsWith('C') ? p : `C${p}`
      let card = `${prefix} N1 N2 ${computedValue || '1u'}`
      if (capIc) card += ` ic=${capIc}`
      if (capM && capM !== '1') card += ` m=${capM}`
      return card
    }
    if (compType === 'inductor') {
      const p = label.trim() || 'L1'
      const prefix = p.startsWith('L') ? p : `L${p}`
      let card = `${prefix} N1 N2 ${computedValue || '10m'}`
      if (indIc) card += ` ic=${indIc}`
      if (indM && indM !== '1') card += ` m=${indM}`
      return card
    }
    if (
      compType === 'diode' ||
      compType === 'zener-diode' ||
      compType === 'schottky-diode' ||
      compType === 'led'
    ) {
      const p = label.trim() || 'D1'
      const prefix = p.startsWith('D') ? p : `D${p}`
      const mod = unit === 'Custom' ? customModel.trim() || '1N4148' : unit || '1N4148'
      let card = `${prefix} A K ${mod}`
      if (diodeArea && diodeArea !== '1') card += ` ${diodeArea}`
      if (diodeOff) card += ` off`
      if (diodeIc) card += ` ic=${diodeIc}`
      if (diodeM && diodeM !== '1') card += ` m=${diodeM}`
      return card
    }
    if (compType === 'npn-bjt' || compType === 'pnp-bjt') {
      const p = label.trim() || (compType === 'npn-bjt' ? 'Q1' : 'Q2')
      const prefix = p.startsWith('Q') ? p : `Q${p}`
      const mod =
        unit === 'Custom'
          ? customModel.trim() || (compType === 'npn-bjt' ? '2N2222' : '2N2907')
          : unit || '2N2222'
      let card = `${prefix} C B E ${mod}`
      if (bjtArea && bjtArea !== '1') card += ` ${bjtArea}`
      if (bjtOff) card += ` off`
      if (bjtIc) card += ` ic=${bjtIc}`
      if (bjtM && bjtM !== '1') card += ` m=${bjtM}`
      return card
    }
    if (isDigitalLogicComponent(compType)) {
      const p = label.trim() || 'U1'
      const prefix = p.startsWith('X') || p.startsWith('U') ? p : `U${p}`
      const subcktName = getGenericSubcktName(compType as SchematicComponentType, unit)
      if (compType === 'gate-not') {
        return `X${prefix} IN OUT VCC 0 ${subcktName}\n* Inbuilt rails: VCC (+5V) and 0 (GND)`
      }
      if (compType === 'flipflop-d') {
        return `X${prefix} D CLK Q Q_BAR VCC 0 ${subcktName}\n* Inbuilt rails: VCC (+5V) and 0 (GND)`
      }
      if (compType === 'flipflop-jk') {
        return `X${prefix} J K CLK Q Q_BAR VCC 0 ${subcktName}\n* Inbuilt rails: VCC (+5V) and 0 (GND)`
      }
      if (compType === 'mux-2to1') {
        return `X${prefix} IN0 IN1 SEL OUT VCC 0 ${subcktName}\n* Inbuilt rails: VCC (+5V) and 0 (GND)`
      }
      if (compType === 'counter-4bit') {
        return `X${prefix} CLK RST Q0 Q1 Q2 Q3 VCC 0 ${subcktName}\n* Inbuilt rails: VCC (+5V) and 0 (GND)`
      }
      return `X${prefix} IN1 IN2 OUT VCC 0 ${subcktName}\n* Inbuilt rails: VCC (+5V) and 0 (GND)`
    }
    return computedValue || '(None)'
  }, [
    compType,
    label,
    computedValue,
    unit,
    customModel,
    mosW,
    mosL,
    mosM,
    mosBulk,
    mosBulkNet,
    resTol,
    resTc1,
    resTc2,
    resTemp,
    resM,
    capIc,
    capM,
    indIc,
    indM,
    diodeArea,
    diodeOff,
    diodeIc,
    diodeM,
    bjtArea,
    bjtOff,
    bjtIc,
    bjtM
  ])

  // Handle Save
  const handleSave = (shouldClose: boolean): void => {
    if (!node) return
    if (compType === 'spice-directive') {
      onApply(node.id, {
        label: directiveType === 'comment' ? '; Comment' : '.SPICE',
        value: directiveText.trim() || '.op',
        directiveType,
        rotation
      })
    } else if (compType === 'schematic-text') {
      onApply(node.id, {
        label: 'Text',
        value: directiveText.trim() || 'Annotation',
        rotation
      })
    } else if (
      compType === 'net-label' ||
      compType === 'port-in' ||
      compType === 'port-out' ||
      compType === 'port-bi'
    ) {
      const cleanNet = (netName.trim() || 'NET').toUpperCase()
      onApply(node.id, {
        label: cleanNet,
        value: cleanNet,
        type: compType as SchematicComponentType,
        rotation
      })
    } else {
      const updatedProps: Record<string, unknown> = { ...(node.data?.properties || {}) }

      if (compType === 'nmos' || compType === 'pmos') {
        updatedProps.w = mosW.trim() || '10u'
        updatedProps.l = mosL.trim() || '1u'
        updatedProps.m = mosM.trim() || '1'
        updatedProps.bulk = mosBulk
        updatedProps.bulkNet = mosBulkNet.trim()
        updatedProps.ad = mosAD.trim()
        updatedProps.as = mosAS.trim()
        updatedProps.pd = mosPD.trim()
        updatedProps.ps = mosPS.trim()
      } else if (compType === 'resistor') {
        updatedProps.tol = resTol.trim()
        updatedProps.tc1 = resTc1.trim()
        updatedProps.tc2 = resTc2.trim()
        updatedProps.temp = resTemp.trim()
        updatedProps.m = resM.trim() || '1'
      } else if (compType === 'capacitor') {
        updatedProps.ic = capIc.trim()
        updatedProps.rser = capRser.trim()
        updatedProps.m = capM.trim() || '1'
      } else if (compType === 'inductor') {
        updatedProps.ic = indIc.trim()
        updatedProps.rser = indRser.trim()
        updatedProps.m = indM.trim() || '1'
      } else if (
        compType === 'diode' ||
        compType === 'zener-diode' ||
        compType === 'schottky-diode' ||
        compType === 'led'
      ) {
        updatedProps.area = diodeArea.trim() || '1'
        updatedProps.m = diodeM.trim() || '1'
        updatedProps.ic = diodeIc.trim()
        updatedProps.off = diodeOff
      } else if (compType === 'npn-bjt' || compType === 'pnp-bjt') {
        updatedProps.area = bjtArea.trim() || '1'
        updatedProps.m = bjtM.trim() || '1'
        updatedProps.ic = bjtIc.trim()
        updatedProps.off = bjtOff
      }

      onApply(node.id, {
        label: label.trim() || node.id,
        value: computedValue,
        rotation,
        properties: updatedProps
      })
    }
    setIsDirty(false)
    if (shouldClose) {
      onClose()
    }
  }

  // Keyboard navigation: Escape cancels, Enter (without Shift) OKs
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target as HTMLElement | null
        if (target && target.tagName === 'TEXTAREA') return
        e.preventDefault()
        handleSave(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, label, computedValue, rotation, node, onClose, acPhase])

  if (!isOpen || !node) return null

  const unitOptions =
    compType !== 'junction'
      ? DEVICE_UNITS[compType as SchematicComponentType] || DEVICE_UNITS.generic
      : []

  const isModelType =
    compType !== 'junction' && MODEL_COMPONENTS.has(compType as SchematicComponentType)

  const pins: PinDef[] =
    compType !== 'junction' ? getComponentPins(compType as SchematicComponentType) : []

  const friendlyName = getFriendlyTypeName(compType)
  const categoryName = getComponentCategory(compType)

  return (
    <div
      className="comp-prop-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="comp-prop-dialog-title"
    >
      <div className="comp-prop-win-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Compact Windows Titlebar */}
        <div className="comp-prop-win-titlebar">
          <div className="comp-prop-win-title">
            <span className="comp-prop-win-title-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="12" rx="1" fill="#0055ea" />
                <rect x="2" y="3" width="12" height="2" fill="#ffffff" opacity="0.3" />
                <path
                  d="M4 7h8M4 9h6M4 11h4"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span id="comp-prop-dialog-title">
              {label || node.id} - {friendlyName} {t('componentProperties.propertiesTitle')}
            </span>
          </div>

          <button
            type="button"
            className="comp-prop-win-close-btn"
            onClick={onClose}
            aria-label={t('actions.close')}
            title={t('componentProperties.cancelEsc')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Dialog Body */}
        <div className="comp-prop-win-body">
          {/* SPICE DIRECTIVE EDITOR */}
          {compType === 'spice-directive' && (
            <fieldset className="comp-prop-win-fieldset">
              <legend className="comp-prop-win-legend">
                {t('componentProperties.spiceDirectiveBlock')}
              </legend>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11.5,
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="directiveType"
                      checked={directiveType === 'spice'}
                      onChange={() => {
                        setDirectiveType('spice')
                        setIsDirty(true)
                      }}
                    />
                    <strong>{t('componentProperties.spiceDirective')}</strong>{' '}
                    {t('componentProperties.spiceDirectiveDesc')}
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11.5,
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="directiveType"
                      checked={directiveType === 'comment'}
                      onChange={() => {
                        setDirectiveType('comment')
                        setIsDirty(true)
                      }}
                    />
                    <strong>{t('componentProperties.comment')}</strong>{' '}
                    {t('componentProperties.commentDesc')}
                  </label>
                </div>

                <div>
                  <textarea
                    id="prop-directive-textarea"
                    className="comp-prop-win-input"
                    style={{
                      width: '100%',
                      height: 105,
                      fontFamily: 'Consolas, "JetBrains Mono", monospace',
                      fontSize: 12,
                      fontWeight: 600,
                      color: directiveType === 'comment' ? '#166534' : '#1e40af',
                      background: directiveType === 'comment' ? '#f0fdf4' : '#f8fafc',
                      resize: 'vertical',
                      padding: 8,
                      boxSizing: 'border-box'
                    }}
                    value={directiveText}
                    onChange={(e) => {
                      setDirectiveText(e.target.value)
                      setIsDirty(true)
                    }}
                    placeholder={t('componentProperties.directivePlaceholder')}
                    autoFocus
                  />
                </div>

                <div>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      fontWeight: 600,
                      display: 'block',
                      marginBottom: 4
                    }}
                  >
                    {t('componentProperties.quickTemplates')}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {[
                      { label: '.tran 1u 10m', snippet: '.tran 1u 10m' },
                      { label: '.ac dec 10 1 100k', snippet: '.ac dec 10 1 100k' },
                      { label: '.op', snippet: '.op' },
                      { label: '.dc V1 0 5 0.1', snippet: '.dc V1 0 5 0.1' },
                      { label: '.param R1=1k', snippet: '.param R1=1k' },
                      { label: '.lib "tsmc180" TT', snippet: '.lib "models/tsmc180.lib" TT' },
                      {
                        label: '.include "discrete"',
                        snippet: '.include "models/discrete_transistors.lib"'
                      },
                      {
                        label: '.model D1 D(...)',
                        snippet: '.model 1N4148 D(Is=2.52n Rs=0.568 N=1.75)'
                      },
                      {
                        label: '.model NMOS Level=8',
                        snippet:
                          '.model NMOS_CUSTOM NMOS(Level=8 Version=3.2.4 Tox=4n Vth0=0.4 U0=450)'
                      }
                    ].map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        className="comp-prop-win-btn comp-prop-win-inline-btn"
                        style={{
                          padding: '2px 7px',
                          fontSize: 10.5,
                          fontFamily: 'Consolas, monospace',
                          fontWeight: 600
                        }}
                        onClick={() => {
                          setDirectiveText((prev) =>
                            prev ? `${prev}\n${tpl.snippet}` : tpl.snippet
                          )
                          setDirectiveType('spice')
                          setIsDirty(true)
                        }}
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </fieldset>
          )}

          {/* SCHEMATIC TEXT ANNOTATION EDITOR */}
          {compType === 'schematic-text' && (
            <fieldset className="comp-prop-win-fieldset">
              <legend className="comp-prop-win-legend">
                {t('componentProperties.textAnnotation')}
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 2px' }}>
                <textarea
                  className="comp-prop-win-input"
                  style={{
                    width: '100%',
                    height: 90,
                    fontFamily: '"Segoe UI", sans-serif',
                    fontSize: 12.5,
                    padding: 8,
                    boxSizing: 'border-box'
                  }}
                  value={directiveText}
                  onChange={(e) => {
                    setDirectiveText(e.target.value)
                    setIsDirty(true)
                  }}
                  placeholder={t('componentProperties.textAnnotationPlaceholder')}
                  autoFocus
                />
              </div>
            </fieldset>
          )}

          {/* NET LABEL & PORT PROPERTIES */}
          {(compType === 'net-label' ||
            compType === 'port-in' ||
            compType === 'port-out' ||
            compType === 'port-bi') && (
            <fieldset className="comp-prop-win-fieldset">
              <legend className="comp-prop-win-legend">
                {compType === 'net-label'
                  ? t('componentProperties.netLabelProps')
                  : t('componentProperties.portProps')}
              </legend>
              <div className="comp-prop-win-form-grid">
                <label className="comp-prop-win-label" htmlFor="prop-net-name-input">
                  {compType === 'net-label'
                    ? t('componentProperties.netName')
                    : t('componentProperties.portName')}
                </label>
                <div className="comp-prop-win-control-col">
                  <input
                    id="prop-net-name-input"
                    type="text"
                    className="comp-prop-win-input"
                    value={netName}
                    onChange={(e) => {
                      setNetName(e.target.value)
                      setIsDirty(true)
                    }}
                    placeholder="e.g. VIN, VOUT, CLK, RESET"
                    autoFocus
                  />
                </div>

                <span className="comp-prop-win-label">
                  {t('componentProperties.electricalConnectivity')}
                </span>
                <div className="comp-prop-win-control-col">
                  <span
                    className="comp-prop-win-static-text"
                    style={{ color: '#2563eb', fontWeight: 600 }}
                  >
                    {t('componentProperties.assignsNetWire', {
                      name: netName.trim().toUpperCase() || 'NET'
                    })}
                  </span>
                </div>
              </div>
            </fieldset>
          )}

          {/* STANDARD COMPONENT IDENTIFICATION & PARAMETERS */}
          {compType !== 'spice-directive' &&
            compType !== 'schematic-text' &&
            compType !== 'net-label' &&
            compType !== 'port-in' &&
            compType !== 'port-out' &&
            compType !== 'port-bi' && (
              <>
                {/* Section 1: Identification */}
                <fieldset className="comp-prop-win-fieldset">
                  <legend className="comp-prop-win-legend">
                    {t('componentProperties.identification')}
                  </legend>
                  <div className="comp-prop-win-form-grid">
                    <label className="comp-prop-win-label" htmlFor="prop-ref-input">
                      {t('componentProperties.refDesignator')}
                    </label>
                    <div className="comp-prop-win-control-col">
                      <input
                        id="prop-ref-input"
                        type="text"
                        className="comp-prop-win-input"
                        value={label}
                        onChange={(e) => {
                          setLabel(e.target.value)
                          setIsDirty(true)
                        }}
                        placeholder="e.g. R1, V1, C1"
                        autoFocus
                      />
                    </div>

                    <span className="comp-prop-win-label">{t('componentProperties.compType')}</span>
                    <div className="comp-prop-win-control-col">
                      <span className="comp-prop-win-static-text">{friendlyName}</span>
                    </div>

                    <span className="comp-prop-win-label">{t('componentProperties.category')}</span>
                    <div className="comp-prop-win-control-col">
                      <span className="comp-prop-win-static-text">{categoryName}</span>
                    </div>
                  </div>
                </fieldset>

                {/* Section 2: Parameters & SPICE Values */}
                {compType !== 'junction' && compType !== 'ground' && (
                  <fieldset className="comp-prop-win-fieldset">
                    <legend className="comp-prop-win-legend">
                      {t('componentProperties.electricalParamsValue')}
                    </legend>
                    <div className="comp-prop-win-form-grid">
                      {/* MOSFET PARAMETERS (NMOS / PMOS) */}
                      {compType === 'nmos' || compType === 'pmos' ? (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-model-select">
                            {t('componentProperties.transistorModel')}
                          </label>
                          <div className="comp-prop-win-control-col">
                            <select
                              id="prop-model-select"
                              className="comp-prop-win-select"
                              value={unit}
                              onChange={(e) => {
                                const newU = e.target.value
                                setUnit(newU)
                                if (newU !== 'Custom') {
                                  setCustomModel(newU)
                                  if (newU.includes('180')) {
                                    setMosW('1.8u')
                                    setMosL('0.18u')
                                  } else if (newU.includes('45')) {
                                    setMosW('0.45u')
                                    setMosL('0.045u')
                                  } else if (newU.includes('3U')) {
                                    setMosW('10u')
                                    setMosL('3u')
                                  }
                                }
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-custom-model-input">
                            {t('componentProperties.spiceModelName')}
                          </label>
                          <div className="comp-prop-win-control-col">
                            <input
                              id="prop-custom-model-input"
                              type="text"
                              className="comp-prop-win-input"
                              value={customModel}
                              onChange={(e) => {
                                setCustomModel(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 2N7000, NMOS_180N, my_lib_nmos"
                            />
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-mos-w-input">
                            {t('componentProperties.channelWidth')}
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-mos-w-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={mosW}
                              onChange={(e) => {
                                setMosW(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 10u, 1.8u, 180n, 45n"
                            />
                            <div style={{ display: 'flex', gap: 3 }}>
                              {['10u', '1.8u', '360n', '180n'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  className="comp-prop-win-btn comp-prop-win-inline-btn"
                                  style={{ padding: '1px 5px', fontSize: 10 }}
                                  onClick={() => {
                                    setMosW(preset)
                                    setIsDirty(true)
                                  }}
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-mos-l-input">
                            {t('componentProperties.channelLength')}
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-mos-l-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={mosL}
                              onChange={(e) => {
                                setMosL(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 1u, 0.18u, 45n"
                            />
                            <div style={{ display: 'flex', gap: 3 }}>
                              {['1u', '0.5u', '0.18u', '45n'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  className="comp-prop-win-btn comp-prop-win-inline-btn"
                                  style={{ padding: '1px 5px', fontSize: 10 }}
                                  onClick={() => {
                                    setMosL(preset)
                                    setIsDirty(true)
                                  }}
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-mos-m-input">
                            {t('componentProperties.multiplier')}
                          </label>
                          <div className="comp-prop-win-control-col">
                            <input
                              id="prop-mos-m-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ width: '80px' }}
                              value={mosM}
                              onChange={(e) => {
                                setMosM(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="1"
                            />
                            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                              {t('componentProperties.parallelDeviceCount')}
                            </span>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-mos-bulk-select">
                            {t('componentProperties.bulkSubstrate')}
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <select
                              id="prop-mos-bulk-select"
                              className="comp-prop-win-select"
                              style={{ width: '160px' }}
                              value={mosBulk}
                              onChange={(e) => {
                                setMosBulk(e.target.value)
                                setIsDirty(true)
                              }}
                            >
                              <option value="wire">{t('componentProperties.bulkWire')}</option>
                              <option value="source">{t('componentProperties.bulkSource')}</option>
                              <option value="ground">{t('componentProperties.bulkGround')}</option>
                              <option value="vcc">
                                {compType === 'pmos' ? 'VCC / VDD Rail' : 'VCC Power Rail'}
                              </option>
                              <option value="custom">{t('componentProperties.bulkCustom')}</option>
                            </select>
                            {mosBulk === 'custom' && (
                              <input
                                type="text"
                                className="comp-prop-win-input"
                                style={{ flex: 1 }}
                                value={mosBulkNet}
                                onChange={(e) => {
                                  setMosBulkNet(e.target.value)
                                  setIsDirty(true)
                                }}
                                placeholder={compType === 'nmos' ? 'e.g. 0 (GND)' : 'e.g. VCC'}
                              />
                            )}
                          </div>

                          <span className="comp-prop-win-label">
                            {t('componentProperties.generatedSpiceCard')}
                          </span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">{liveSpiceCard}</code>
                          </div>
                        </>
                      ) : compType === 'resistor' ? (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-mag-input">
                            {t('componentProperties.resistanceValue')}
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-mag-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={magnitude}
                              onChange={(e) => {
                                setMagnitude(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 10, 4.7, 100"
                            />
                            <select
                              className="comp-prop-win-select"
                              style={{ width: '135px' }}
                              value={unit}
                              onChange={(e) => {
                                setUnit(e.target.value)
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-res-tol-select">
                            {t('componentProperties.tolerance')}
                          </label>
                          <div className="comp-prop-win-control-col">
                            <select
                              id="prop-res-tol-select"
                              className="comp-prop-win-select"
                              style={{ width: '135px' }}
                              value={resTol}
                              onChange={(e) => {
                                setResTol(e.target.value)
                                setIsDirty(true)
                              }}
                            >
                              <option value="">{t('componentProperties.tolerances.none')}</option>
                              <option value="0.1%">
                                {t('componentProperties.tolerances.p01')}
                              </option>
                              <option value="1%">{t('componentProperties.tolerances.p1')}</option>
                              <option value="5%">{t('componentProperties.tolerances.p5')}</option>
                              <option value="10%">{t('componentProperties.tolerances.p10')}</option>
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-res-tc1-input">
                            {t('componentProperties.tempCoeff')}
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-res-tc1-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={resTc1}
                              onChange={(e) => {
                                setResTc1(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 50e-6, 100e-6"
                            />
                            <span style={{ fontSize: 11, color: '#64748b' }}>1/°C</span>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-res-m-input">
                            {t('componentProperties.parallelMultiplier')}
                          </label>
                          <div className="comp-prop-win-control-col">
                            <input
                              id="prop-res-m-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ width: '80px' }}
                              value={resM}
                              onChange={(e) => {
                                setResM(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="1"
                            />
                          </div>

                          <span className="comp-prop-win-label">
                            {t('componentProperties.generatedSpiceCard')}
                          </span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">{liveSpiceCard}</code>
                          </div>
                        </>
                      ) : compType === 'capacitor' ? (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-mag-input">
                            Capacitance Value:
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-mag-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={magnitude}
                              onChange={(e) => {
                                setMagnitude(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 1, 10, 100"
                            />
                            <select
                              className="comp-prop-win-select"
                              style={{ width: '135px' }}
                              value={unit}
                              onChange={(e) => {
                                setUnit(e.target.value)
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-cap-ic-input">
                            Initial Voltage (IC):
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-cap-ic-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={capIc}
                              onChange={(e) => {
                                setCapIc(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 5V, 0V, 2.5"
                            />
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              Transient initial condition
                            </span>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-cap-m-input">
                            Parallel Multiplier (M):
                          </label>
                          <div className="comp-prop-win-control-col">
                            <input
                              id="prop-cap-m-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ width: '80px' }}
                              value={capM}
                              onChange={(e) => {
                                setCapM(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="1"
                            />
                          </div>

                          <span className="comp-prop-win-label">Generated SPICE Card:</span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">{liveSpiceCard}</code>
                          </div>
                        </>
                      ) : compType === 'inductor' ? (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-mag-input">
                            Inductance Value:
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-mag-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={magnitude}
                              onChange={(e) => {
                                setMagnitude(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 10, 100, 1"
                            />
                            <select
                              className="comp-prop-win-select"
                              style={{ width: '135px' }}
                              value={unit}
                              onChange={(e) => {
                                setUnit(e.target.value)
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-ind-ic-input">
                            Initial Current (IC):
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-ind-ic-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={indIc}
                              onChange={(e) => {
                                setIndIc(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 10mA, 100m, 1A"
                            />
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              Transient initial condition
                            </span>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-ind-m-input">
                            Parallel Multiplier (M):
                          </label>
                          <div className="comp-prop-win-control-col">
                            <input
                              id="prop-ind-m-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ width: '80px' }}
                              value={indM}
                              onChange={(e) => {
                                setIndM(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="1"
                            />
                          </div>

                          <span className="comp-prop-win-label">Generated SPICE Card:</span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">{liveSpiceCard}</code>
                          </div>
                        </>
                      ) : compType === 'npn-bjt' || compType === 'pnp-bjt' ? (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-model-select">
                            BJT Model / Preset:
                          </label>
                          <div className="comp-prop-win-control-col">
                            <select
                              id="prop-model-select"
                              className="comp-prop-win-select"
                              value={unit}
                              onChange={(e) => {
                                const newU = e.target.value
                                setUnit(newU)
                                if (newU !== 'Custom') {
                                  setCustomModel(newU)
                                }
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-custom-model-input">
                            SPICE Model Name:
                          </label>
                          <div className="comp-prop-win-control-col">
                            <input
                              id="prop-custom-model-input"
                              type="text"
                              className="comp-prop-win-input"
                              value={customModel}
                              onChange={(e) => {
                                setCustomModel(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 2N2222, 2N3904, BC547B"
                            />
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-bjt-area-input">
                            Area Factor:
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-bjt-area-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ width: '80px' }}
                              value={bjtArea}
                              onChange={(e) => {
                                setBjtArea(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="1.0"
                            />
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: 11,
                                cursor: 'pointer',
                                marginLeft: 12
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={bjtOff}
                                onChange={(e) => {
                                  setBjtOff(e.target.checked)
                                  setIsDirty(true)
                                }}
                              />
                              Initial OFF state (DC)
                            </label>
                          </div>

                          <span className="comp-prop-win-label">Generated SPICE Card:</span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">{liveSpiceCard}</code>
                          </div>
                        </>
                      ) : compType === 'diode' ||
                        compType === 'zener-diode' ||
                        compType === 'schottky-diode' ||
                        compType === 'led' ? (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-model-select">
                            Diode Model / Preset:
                          </label>
                          <div className="comp-prop-win-control-col">
                            <select
                              id="prop-model-select"
                              className="comp-prop-win-select"
                              value={unit}
                              onChange={(e) => {
                                const newU = e.target.value
                                setUnit(newU)
                                if (newU !== 'Custom') {
                                  setCustomModel(newU)
                                }
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-custom-model-input">
                            SPICE Model Name:
                          </label>
                          <div className="comp-prop-win-control-col">
                            <input
                              id="prop-custom-model-input"
                              type="text"
                              className="comp-prop-win-input"
                              value={customModel}
                              onChange={(e) => {
                                setCustomModel(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 1N4148, 1N4007, BZX84C5V1"
                            />
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-diode-area-input">
                            Area Factor:
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-diode-area-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ width: '80px' }}
                              value={diodeArea}
                              onChange={(e) => {
                                setDiodeArea(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="1.0"
                            />
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: 11,
                                cursor: 'pointer',
                                marginLeft: 12
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={diodeOff}
                                onChange={(e) => {
                                  setDiodeOff(e.target.checked)
                                  setIsDirty(true)
                                }}
                              />
                              Initial OFF state (DC)
                            </label>
                          </div>

                          <span className="comp-prop-win-label">Generated SPICE Card:</span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">{liveSpiceCard}</code>
                          </div>
                        </>
                      ) : isModelType ? (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-model-select">
                            Device Model / Preset:
                          </label>
                          <div className="comp-prop-win-control-col">
                            <select
                              id="prop-model-select"
                              className="comp-prop-win-select"
                              value={unit}
                              onChange={(e) => {
                                const newU = e.target.value
                                setUnit(newU)
                                if (newU !== 'Custom') {
                                  setCustomModel(newU)
                                }
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-custom-model-input">
                            SPICE Model / Value:
                          </label>
                          <div className="comp-prop-win-control-col">
                            <input
                              id="prop-custom-model-input"
                              type="text"
                              className="comp-prop-win-input"
                              value={customModel}
                              onChange={(e) => {
                                setCustomModel(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. LM741, 2N5457"
                            />
                          </div>

                          <span className="comp-prop-win-label">
                            {t('componentProperties.generatedSpiceString')}
                          </span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">
                              {isDigitalLogicComponent(compType)
                                ? liveSpiceCard
                                : computedValue || '(None)'}
                            </code>
                            {isDigitalLogicComponent(compType) && (
                              <div
                                style={{
                                  marginTop: 6,
                                  padding: '6px 8px',
                                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  color: '#065f46',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                              >
                                <span>⚡</span>
                                <span>
                                  <strong>Inbuilt Power Active:</strong> VCC (+5V) and Ground (0V)
                                  are connected internally. No external ground or power pins needed!
                                </span>
                              </div>
                            )}
                          </div>
                        </>
                      ) : compType === 'ac-source' ? (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-ac-amp-input">
                            AC Amplitude (Peak):
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-ac-amp-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={magnitude}
                              onChange={(e) => {
                                setMagnitude(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 1, 5, 0.5"
                            />
                            <select
                              className="comp-prop-win-select"
                              style={{ width: '135px' }}
                              value={unit}
                              onChange={(e) => {
                                setUnit(e.target.value)
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="comp-prop-win-label" htmlFor="prop-ac-phase-input">
                            AC Phase (Degrees):
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-ac-phase-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={acPhase}
                              onChange={(e) => {
                                setAcPhase(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder="e.g. 0, 45, -90, 180"
                            />
                            <span
                              className="comp-prop-win-badge"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '135px',
                                fontSize: 11.5,
                                fontWeight: 600,
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: 3,
                                color: '#475569',
                                userSelect: 'none'
                              }}
                            >
                              ° (degrees)
                            </span>
                          </div>

                          <span className="comp-prop-win-label">
                            {t('componentProperties.generatedSpiceString')}
                          </span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">
                              {computedValue || '(None)'}
                            </code>
                          </div>
                        </>
                      ) : (
                        <>
                          <label className="comp-prop-win-label" htmlFor="prop-mag-input">
                            {compType === 'voltage-source' ? 'DC Voltage Value:' : 'Nominal Value:'}
                          </label>
                          <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                            <input
                              id="prop-mag-input"
                              type="text"
                              className="comp-prop-win-input"
                              style={{ flex: 1 }}
                              value={magnitude}
                              onChange={(e) => {
                                setMagnitude(e.target.value)
                                setIsDirty(true)
                              }}
                              placeholder={
                                compType === 'voltage-source'
                                  ? 'e.g. 5, 12, 3.3'
                                  : 'e.g. 10, 4.7, 100'
                              }
                            />
                            <select
                              className="comp-prop-win-select"
                              style={{ width: '135px' }}
                              value={unit}
                              onChange={(e) => {
                                setUnit(e.target.value)
                                setIsDirty(true)
                              }}
                            >
                              {unitOptions.map((opt) => (
                                <option key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <span className="comp-prop-win-label">
                            {t('componentProperties.generatedSpiceString')}
                          </span>
                          <div className="comp-prop-win-control-col">
                            <code className="comp-prop-win-preview-code">
                              {computedValue || '(None)'}
                            </code>
                          </div>
                        </>
                      )}
                    </div>
                  </fieldset>
                )}
              </>
            )}

          {/* Section 3: Orientation & Geometry */}
          <fieldset className="comp-prop-win-fieldset">
            <legend className="comp-prop-win-legend">{t('componentProperties.orientation')}</legend>
            <div className="comp-prop-win-form-grid">
              <label className="comp-prop-win-label" htmlFor="prop-rotation-select">
                {t('componentProperties.rotation')}
              </label>
              <div className="comp-prop-win-control-col comp-prop-win-dual-control">
                <select
                  id="prop-rotation-select"
                  className="comp-prop-win-select"
                  style={{ flex: 1 }}
                  value={rotation}
                  onChange={(e) => {
                    setRotation(parseInt(e.target.value, 10) || 0)
                    setIsDirty(true)
                  }}
                >
                  <option value={0}>{t('componentProperties.orientations.deg0')}</option>
                  <option value={90}>{t('componentProperties.orientations.deg90')}</option>
                  <option value={180}>{t('componentProperties.orientations.deg180')}</option>
                  <option value={270}>{t('componentProperties.orientations.deg270')}</option>
                </select>

                <button
                  type="button"
                  className="comp-prop-win-btn comp-prop-win-inline-btn"
                  onClick={() => {
                    setRotation((curr) => (curr + 90) % 360)
                    setIsDirty(true)
                  }}
                  title={t('componentProperties.rotateBtn')}
                >
                  {t('componentProperties.rotateBtn')}
                </button>
              </div>

              <span className="comp-prop-win-label">{t('componentProperties.schematicPos')}</span>
              <div className="comp-prop-win-control-col">
                <span className="comp-prop-win-static-text">
                  X: {Math.round(node.position.x)} px, Y: {Math.round(node.position.y)} px
                </span>
              </div>
            </div>
          </fieldset>

          {/* Section 4: Terminals & Net Connectivity */}
          {pins.length > 0 && (
            <fieldset className="comp-prop-win-fieldset">
              <legend className="comp-prop-win-legend">
                {t('componentProperties.terminalsTitle', { count: pins.length })}
              </legend>
              <div className="comp-prop-win-terminals-wrapper">
                <table className="comp-prop-win-table">
                  <thead>
                    <tr>
                      <th style={{ width: '70px' }}>{t('componentProperties.pinId')}</th>
                      <th style={{ width: '90px' }}>{t('componentProperties.terminal')}</th>
                      <th>{t('componentProperties.connectedNet')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pins.map((pin) => {
                      const net = pinNetMap[pin.id]
                      const isConnected = Boolean(net)
                      return (
                        <tr key={pin.id}>
                          <td className="comp-prop-win-pin-id">{pin.id}</td>
                          <td className="comp-prop-win-pin-name">{pin.name}</td>
                          <td className="comp-prop-win-pin-net">
                            {isConnected ? (
                              <span className="comp-prop-win-net-badge">
                                Net {net === '0' ? '0 (GND)' : net}
                              </span>
                            ) : (
                              <span className="comp-prop-win-net-unconnected">
                                {t('componentProperties.floating')}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </fieldset>
          )}
        </div>

        {/* Dialog Footer with Classic Windows Buttons */}
        <div className="comp-prop-win-footer">
          <div className="comp-prop-win-footer-info">
            {isDirty && (
              <span className="comp-prop-win-unsaved-hint">
                {t('componentProperties.unsavedEdits')}
              </span>
            )}
          </div>
          <div className="comp-prop-win-footer-btns">
            <button
              type="button"
              className="comp-prop-win-btn comp-prop-win-btn-default"
              onClick={() => handleSave(true)}
            >
              {t('actions.ok')}
            </button>
            <button type="button" className="comp-prop-win-btn" onClick={onClose}>
              {t('actions.cancel')}
            </button>
            <button
              type="button"
              className="comp-prop-win-btn"
              onClick={() => handleSave(false)}
              disabled={!isDirty}
            >
              {t('actions.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ComponentPropertiesModal

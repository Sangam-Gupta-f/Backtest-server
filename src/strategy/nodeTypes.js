import { INDICATORS } from '../indicators/index.js';

// Every value flowing along an edge in a strategy graph has one of these shapes:
//   candles  - raw OHLCV series from a data source
//   series   - a single numeric series aligned to candle timestamps
//              (an indicator output, a raw price field, or a constant)
//   signal   - a boolean series (true/false per bar), from a condition or logic node
//   position - an execution context threading from an entry through
//              sizing/risk rules to an exit
export const PORT_TYPES = ['candles', 'series', 'signal', 'position'];

const oneOf = (values) => (value) => values.includes(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const INTERVALS = [
  'ONE_MINUTE', 'THREE_MINUTE', 'FIVE_MINUTE', 'TEN_MINUTE',
  'FIFTEEN_MINUTE', 'THIRTY_MINUTE', 'ONE_HOUR', 'ONE_DAY',
];

const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'volume'];
const CONDITION_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'crossesAbove', 'crossesBelow'];
const LOGIC_OPERATORS = ['and', 'or', 'not'];
const DIRECTIONS = ['LONG', 'SHORT'];
const ORDER_TYPES = ['MARKET', 'LIMIT'];
const PRODUCT_TYPES = ['INTRADAY', 'DELIVERY', 'MARGIN'];
const SIZING_METHODS = ['fixedQuantity', 'fixedCapital', 'percentEquity'];
const RISK_KINDS = ['stopLoss', 'target', 'trailingStop'];
const RISK_MODES = ['percent', 'points', 'atrMultiple'];
const MACD_OUTPUTS = ['macd', 'signal', 'histogram'];
const BB_OUTPUTS = ['upper', 'middle', 'lower'];

// Each node type declares:
//  - inputs: { handleName: portType } it accepts. An edge landing on that
//    handle must come from a node whose outputType matches exactly.
//  - outputType: the port type produced on the node's single "out" handle
//    (null for terminal nodes that produce nothing).
//  - validateData(data): returns an array of error strings (empty = valid).
export const NODE_TYPES = {
  dataSource: {
    inputs: {},
    outputType: 'candles',
    validateData: (data = {}) => {
      const errors = [];
      if (!isNonEmptyString(data.exchange)) errors.push('exchange is required');
      if (!isNonEmptyString(data.symboltoken)) errors.push('symboltoken is required');
      if (!oneOf(INTERVALS)(data.interval)) errors.push(`interval must be one of: ${INTERVALS.join(', ')}`);
      return errors;
    },
  },

  priceSeries: {
    inputs: { in: 'candles' },
    outputType: 'series',
    validateData: (data = {}) =>
      oneOf(PRICE_FIELDS)(data.field) ? [] : [`field must be one of: ${PRICE_FIELDS.join(', ')}`],
  },

  indicator: {
    inputs: { in: 'candles' },
    outputType: 'series',
    validateData: (data = {}) => {
      const errors = [];
      if (!Object.keys(INDICATORS).includes(data.indicator)) {
        errors.push(`indicator must be one of: ${Object.keys(INDICATORS).join(', ')}`);
      }
      if (data.params !== undefined && (typeof data.params !== 'object' || data.params === null)) {
        errors.push('params must be an object');
      }
      if (data.indicator === 'macd' && data.output && !oneOf(MACD_OUTPUTS)(data.output)) {
        errors.push(`macd output must be one of: ${MACD_OUTPUTS.join(', ')}`);
      }
      if (data.indicator === 'bollingerBands' && data.output && !oneOf(BB_OUTPUTS)(data.output)) {
        errors.push(`bollingerBands output must be one of: ${BB_OUTPUTS.join(', ')}`);
      }
      return errors;
    },
  },

  constant: {
    inputs: {},
    outputType: 'series',
    validateData: (data = {}) => (isFiniteNumber(data.value) ? [] : ['value must be a number']),
  },

  condition: {
    inputs: { left: 'series', right: 'series' },
    outputType: 'signal',
    validateData: (data = {}) =>
      oneOf(CONDITION_OPERATORS)(data.operator) ? [] : [`operator must be one of: ${CONDITION_OPERATORS.join(', ')}`],
  },

  logic: {
    inputs: { a: 'signal', b: 'signal' },
    outputType: 'signal',
    validateData: (data = {}) =>
      oneOf(LOGIC_OPERATORS)(data.operator) ? [] : [`operator must be one of: ${LOGIC_OPERATORS.join(', ')}`],
  },

  entry: {
    inputs: { trigger: 'signal' },
    outputType: 'position',
    validateData: (data = {}) => {
      const errors = [];
      if (!oneOf(DIRECTIONS)(data.direction)) errors.push(`direction must be one of: ${DIRECTIONS.join(', ')}`);
      if (data.orderType && !oneOf(ORDER_TYPES)(data.orderType)) {
        errors.push(`orderType must be one of: ${ORDER_TYPES.join(', ')}`);
      }
      // Used to look up cached brokerage/margin costs at backtest time; not
      // required at design time since a strategy can be validated before the
      // trader has decided how they'll actually hold the position.
      if (data.producttype && !oneOf(PRODUCT_TYPES)(data.producttype)) {
        errors.push(`producttype must be one of: ${PRODUCT_TYPES.join(', ')}`);
      }
      return errors;
    },
  },

  positionSizing: {
    inputs: { in: 'position' },
    outputType: 'position',
    validateData: (data = {}) => {
      const errors = [];
      if (!oneOf(SIZING_METHODS)(data.method)) errors.push(`method must be one of: ${SIZING_METHODS.join(', ')}`);
      if (!isFiniteNumber(data.value)) errors.push('value must be a number');
      return errors;
    },
  },

  riskRule: {
    inputs: { in: 'position' },
    outputType: 'position',
    validateData: (data = {}) => {
      const errors = [];
      if (!oneOf(RISK_KINDS)(data.kind)) errors.push(`kind must be one of: ${RISK_KINDS.join(', ')}`);
      if (!oneOf(RISK_MODES)(data.mode)) errors.push(`mode must be one of: ${RISK_MODES.join(', ')}`);
      if (!isFiniteNumber(data.value)) errors.push('value must be a number');
      return errors;
    },
  },

  // Terminal node: closes a position opened by an entry. Accepts either a
  // risk-managed "position" chain (stop/target hit) or a direct "signal"
  // (a discretionary rule-based exit condition) — at least one is required,
  // enforced in validateStrategy since it depends on which edges are wired.
  exit: {
    inputs: { in: 'position', trigger: 'signal' },
    outputType: null,
    validateData: () => [],
  },
};

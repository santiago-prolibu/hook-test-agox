var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// lib/vendors/prolibu/EventManager.js
var require_EventManager = __commonJS({
  "lib/vendors/prolibu/EventManager.js"(exports2, module2) {
    var EventManager = class {
      constructor() {
        this.handlers = {};
        this.errorMode = "immediate";
        this.currentEventName = null;
        this.isInitialized = false;
      }
      /**
       * Registers an event handler for a specific event name
       * 
       * ARCHITECTURE: This method stores handlers in a Map-like structure where each event name
       * maps to an array of handler functions. Handlers can be synchronous or asynchronous.
       * 
       * @param {string} eventName - The name of the event to listen for
       * @param {function} handler - The function to execute when the event fires (sync or async)
       * @returns {EventManager} - Returns this for method chaining
       */
      on(eventName2, handler) {
        const modelName = eventName2.split(".")[0];
        if (modelName !== "ApiRun" && modelName !== "EndpointRequest") {
          if (!lifecycleHooks.includes(modelName)) {
            console.log(`[WARN] Handler for event "${eventName2}" ignored - model "${modelName}" not in lifecycleHooks: ${JSON.stringify(lifecycleHooks)}`);
            return this;
          }
        }
        if (!this.handlers[eventName2]) {
          this.handlers[eventName2] = [];
        }
        this.handlers[eventName2].push(handler);
        return this;
      }
      /**
       * Executes all handlers for a specific event with full async support
       * 
       * ARCHITECTURE: This is the core execution engine. It processes handlers sequentially,
       * properly awaiting async functions to ensure complete execution before proceeding.
       * This guarantees that all async work is finished before init() resolves.
       * 
       * @param {string} eventName - The event whose handlers should be executed
       * @param {object} payload - Optional data to pass to handlers (default: {})
       * @returns {EventManager} - Returns this for method chaining
       */
      async triggerImmediate(eventName2, payload = {}) {
        if (!this.handlers[eventName2] || this.handlers[eventName2].length === 0) {
          return this;
        }
        for (let i = 0; i < this.handlers[eventName2].length; i++) {
          const handler = this.handlers[eventName2][i];
          try {
            const result = handler(payload);
            if (result && typeof result.then === "function") {
              await result;
            }
          } catch (error) {
            this.handleError(error, eventName2, i + 1);
          }
        }
        return this;
      }
      /**
       * Synchronous event trigger with async error handling compatibility
       * 
       * ARCHITECTURE: This method provides synchronous event execution while still handling
       * async errors through setTimeout. It's used for scenarios where await cannot be used
       * but async error propagation is still needed.
       * 
       * WARNING: Async handlers will not be awaited - they run fire-and-forget style.
       * Use triggerImmediate() instead when you need to wait for async completion.
       * 
       * @param {string} eventName - The event whose handlers should be executed
       * @param {object} payload - Optional data to pass to handlers (default: {})
       * @returns {EventManager} - Returns this for method chaining
       */
      triggerImmediateSync(eventName2, payload = {}) {
        if (!this.handlers[eventName2] || this.handlers[eventName2].length === 0) {
          return this;
        }
        for (let i = 0; i < this.handlers[eventName2].length; i++) {
          const handler = this.handlers[eventName2][i];
          try {
            const result = handler(payload);
            if (result && typeof result.then === "function") {
              result.catch((error) => {
                setTimeout(() => {
                  throw error;
                }, 0);
                this.handleError(error, eventName2, i + 1);
                throw error;
              });
            }
          } catch (error) {
            this.handleError(error, eventName2, i + 1);
          }
        }
        return this;
      }
      /**
       * Configurable error handling system for sandbox environments
       * 
       * ARCHITECTURE: Provides multiple error handling strategies to work around sandbox
       * limitations. Some sandboxes don't propagate async errors properly, so we provide
       * immediate, delayed, and silent modes.
       * 
       * @param {Error} error - The error that occurred during handler execution
       * @param {string} eventName - The event name where the error occurred
       * @param {number} handlerIndex - The index of the handler that failed (for debugging)
       */
      handleError(error, eventName2, handlerIndex) {
        if (typeof global !== "undefined") {
          global.__lastEventError = {
            event: eventName2,
            handler: handlerIndex,
            error: error.message,
            stack: error.stack,
            timestamp: Date.now()
          };
        }
        switch (this.errorMode) {
          case "immediate":
            throw error;
          case "delayed":
            setTimeout(() => {
              throw error;
            }, 0);
            break;
          case "silent":
            break;
          default:
            throw error;
        }
      }
      /**
       * Configures the error handling strategy
       * 
       * @param {string} mode - 'immediate', 'delayed', or 'silent'
       * @returns {EventManager} - Returns this for method chaining
       */
      setErrorMode(mode) {
        this.errorMode = mode;
        return this;
      }
      /**
       * Removes a specific handler from an event
       * 
       * @param {string} eventName - The event to remove the handler from
       * @param {function} handler - The specific handler function to remove
       * @returns {EventManager} - Returns this for method chaining
       */
      off(eventName2, handler) {
        if (this.handlers[eventName2]) {
          this.handlers[eventName2] = this.handlers[eventName2].filter((h) => h !== handler);
        }
        return this;
      }
      /**
       * Removes all event handlers from all events
       * 
       * @returns {EventManager} - Returns this for method chaining
       */
      clear() {
        this.handlers = {};
        return this;
      }
      /**
       * Returns comprehensive statistics about registered events and handlers
       * 
       * @returns {object} - Object containing events count, total handlers, and detailed event list
       */
      getStats() {
        const events = Object.keys(this.handlers);
        const totalHandlers = events.reduce((sum, event) => sum + this.handlers[event].length, 0);
        return {
          events: events.length,
          totalHandlers,
          eventList: events.map((event) => ({
            event,
            handlerCount: this.handlers[event].length
          }))
        };
      }
      /**
       * Returns a list of all registered events with their handler counts
       * 
       * @returns {Array} - Array of objects with event names and handler counts
       */
      getEvents() {
        return Object.keys(this.handlers).map((event) => ({
          event,
          handlerCount: this.handlers[event].length
        }));
      }
      /**
       * Initializes and executes event handlers - THE CORE ORCHESTRATION METHOD
       * 
       * ARCHITECTURE: This is the heart of the EventManager. It reads the global 'eventName'
       * variable from the sandbox context and executes all registered handlers for that event.
       * The method uses async/await to ensure ALL handlers complete before resolving.
       * 
       * WORKFLOW:
       * 1. Prevents double initialization (idempotent)
       * 2. Reads eventName from sandbox global context
       * 3. Executes all matching handlers sequentially with full async support
       * 4. Returns only when all async work is complete
       * 
       * @returns {Promise<void>} - Resolves when all event handlers have completed
       */
      async init() {
        if (this.isInitialized) {
          return;
        }
        this.isInitialized = true;
        this.currentEventName = eventName;
        if (this.handlers[eventName] && this.handlers[eventName].length > 0) {
          await this.triggerImmediate(eventName);
        }
      }
      /**
       * Returns the currently executing event name (useful for debugging)
       * 
       * @returns {string|null} - The current event name or null if not initialized
       */
      getCurrentEventName() {
        return this.currentEventName;
      }
      /**
       * Checks if any handlers are registered for a specific event
       * 
       * @param {string} eventName - The event name to check
       * @returns {boolean} - True if handlers exist, false otherwise
       */
      hasHandlers(eventName2) {
        return this.handlers[eventName2] && this.handlers[eventName2].length > 0;
      }
    };
    var eventManager = new EventManager();
    module2.exports = eventManager;
  }
});

// lib/vendors/prolibu/OutboundIntegration.js
var require_OutboundIntegration = __commonJS({
  "lib/vendors/prolibu/OutboundIntegration.js"(exports2, module2) {
    var Events = require_EventManager();
    var OutboundIntegration2 = class {
      constructor(config = {}) {
        this.config = config;
        this.validateConfig();
      }
      validateConfig() {
        if (!this.config || Object.keys(this.config).length === 0) {
          throw new Error("Configuration is required");
        }
      }
      async registerEvents() {
        const integratedObjects = Object.keys(this.config);
        for (let i = 0; i < integratedObjects.length; i++) {
          const objectName = integratedObjects[i];
          const config = this.config[objectName];
          if (!config.active) {
            continue;
          }
          config.mapToObject = config.mapToObject || objectName;
          config.additionalTransforms = config.additionalTransforms || {};
          if (config.events && typeof config.events !== "object") {
            throw new Error(`'events' key in config for '${objectName}' must be an object.`);
          }
          const eventNames = Object.keys(config.events);
          for (let j = 0; j < eventNames.length; j++) {
            const event = eventNames[j];
            const eventHandler = config.events[event];
            if (typeof eventHandler !== "function") {
              throw new Error(`Event handler for '${event}' in config for '${objectName}' must be a function.`);
            }
            Events.on(event, async () => {
              await eventHandler(objectName, config);
            });
          }
        }
      }
      async initialize() {
        await this.registerEvents();
        await Events.init();
      }
    };
    module2.exports = OutboundIntegration2;
  }
});

// lib/vendors/prolibu/DataMapper.js
var require_DataMapper = __commonJS({
  "lib/vendors/prolibu/DataMapper.js"(exports2, module2) {
    var DataMapper2 = class {
      /**
       * Maps data using a mapping dictionary (supports both sync and async transforms)
       * @param {Object} options - Mapping options
       * @param {Object} options.data - Data to map
       * @param {Object} options.map - Mapping dictionary
       * @param {boolean} options.reverse - If true, reverses mapping (value → key), if false (default) uses (key → value)
       * @param {Object} options.transforms - Additional transforms to concatenate with map transforms
       * @param {Object} options.afterTransforms - Post-processing transforms applied after main mapping (supports async)
       * @returns {Object|Promise<Object>} - Mapped object (Promise if any transform is async)
       */
      static map({ data, map, reverse = false, transforms = {}, afterTransforms = {} } = {}) {
        return this._processMapping({ data, map, reverse, transforms, afterTransforms });
      }
      /**
       * Core mapping logic that handles both sync and async transforms elegantly
       * @private
       */
      static async _processMapping({ data, map, reverse = false, transforms = {}, afterTransforms = {} }) {
        if (!data || typeof data !== "object") {
          throw new Error("DataMapper: data must be a valid object");
        }
        if (!map || typeof map !== "object") {
          throw new Error("DataMapper: map must be a valid mapping object");
        }
        const result = {};
        const { transforms: mapTransforms = {}, ...mappings } = map;
        const allTransforms = { ...mapTransforms, ...transforms };
        const mappingOperations = Object.entries(mappings).map(([sourceKey, targetKey]) => {
          const { sourceField, targetField, transformKey } = this._getMappingFields(sourceKey, targetKey, reverse);
          const value = this.getNestedValue(data, sourceField);
          return { sourceField, targetField, transformKey, value };
        });
        const transformResults = mappingOperations.map(({ targetField, transformKey, value }) => {
          if (value === void 0) return null;
          return this._applyTransform(value, data, allTransforms[transformKey], targetField);
        });
        const hasAsyncTransforms = transformResults.some(
          (result2) => result2 && typeof result2.then === "function"
        );
        let mappedResult;
        if (hasAsyncTransforms) {
          mappedResult = await this._handleAsyncTransforms(transformResults, mappingOperations, result);
        } else {
          this._applySyncResults(transformResults, mappingOperations, result);
          mappedResult = result;
        }
        if (afterTransforms && Object.keys(afterTransforms).length > 0) {
          return this._applyAfterTransforms(mappedResult, afterTransforms, data);
        }
        return mappedResult;
      }
      /**
       * Determines mapping field directions based on reverse flag
       * @private
       */
      static _getMappingFields(sourceKey, targetKey, reverse) {
        if (reverse) {
          return {
            sourceField: targetKey,
            targetField: sourceKey,
            transformKey: sourceKey
          };
        } else {
          return {
            sourceField: sourceKey,
            targetField: targetKey,
            transformKey: targetKey
          };
        }
      }
      /**
       * Applies a transform function (sync or async) to a value
       * @private
       */
      static _applyTransform(value, sourceData, transform, targetField) {
        if (!transform || typeof transform !== "function") {
          return { type: "direct", value, targetField };
        }
        try {
          const transformResult = transform(value, sourceData);
          if (transformResult && typeof transformResult.then === "function") {
            return transformResult.then((result) => ({
              type: "async",
              value: result,
              targetField
            })).catch((error) => {
              console.error(`\u274C Transform error for field ${targetField}:`, error);
              return { type: "error", value: void 0, targetField };
            });
          } else {
            return { type: "sync", value: transformResult, targetField };
          }
        } catch (error) {
          console.error(`\u274C Sync transform error for field ${targetField}:`, error);
          return { type: "error", value: void 0, targetField };
        }
      }
      /**
       * Handles async transforms using Promise.all
       * @private
       */
      static async _handleAsyncTransforms(transformResults, mappingOperations, result) {
        const resolvedResults = await Promise.all(
          transformResults.map((result2) => {
            if (result2 && typeof result2.then === "function") {
              return result2;
            } else if (result2) {
              return Promise.resolve(result2);
            } else {
              return Promise.resolve(null);
            }
          })
        );
        this._applySyncResults(resolvedResults, mappingOperations, result);
        return result;
      }
      /**
       * Applies resolved transform results to the result object
       * @private
       */
      static _applySyncResults(transformResults, mappingOperations, result) {
        transformResults.forEach((transformResult, index) => {
          if (!transformResult) {
            const { targetField: targetField2, value: value2 } = mappingOperations[index];
            if (value2 === null) {
              this.setNestedValue(result, targetField2, null);
            }
            return;
          }
          const { targetField } = mappingOperations[index];
          const { type, value } = transformResult;
          if (type !== "error") {
            this.setNestedValue(result, targetField, value);
          }
        });
      }
      /**
       * Gets a value from an object using dot notation
       * @param {Object} obj - Source object
       * @param {string} path - Path with dot notation (e.g. 'company.name')
       * @returns {*} - Found value or undefined
       */
      static getNestedValue(obj, path) {
        return path.split(".").reduce((current, key) => {
          return current && current[key] !== void 0 ? current[key] : void 0;
        }, obj);
      }
      /**
       * Assigns a value to an object using dot notation
       * @param {Object} obj - Target object
       * @param {string} path - Path with dot notation
       * @param {*} value - Value to assign
       */
      static setNestedValue(obj, path, value) {
        const keys = path.split(".");
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
          if (!current[key] || typeof current[key] !== "object") {
            current[key] = {};
          }
          return current[key];
        }, obj);
        target[lastKey] = value;
      }
      /**
       * Applies afterTransforms to the already mapped result (supports async)
       * @private
       */
      static async _applyAfterTransforms(mappedResult, afterTransforms, originalData) {
        const afterTransformEntries = Object.entries(afterTransforms);
        const afterResults = [];
        for (const [fieldPath, transform] of afterTransformEntries) {
          if (typeof transform !== "function") {
            console.warn(`\u26A0\uFE0F afterTransform for ${fieldPath} is not a function, skipping`);
            continue;
          }
          const currentValue = this.getNestedValue(mappedResult, fieldPath);
          try {
            const transformResult = transform(currentValue, mappedResult, originalData);
            if (transformResult && typeof transformResult.then === "function") {
              afterResults.push(
                transformResult.then((result) => ({ fieldPath, value: result, type: "success" })).catch((error) => {
                  console.error(`\u274C afterTransform error for field ${fieldPath}:`, error);
                  return { fieldPath, value: currentValue, type: "error" };
                })
              );
            } else {
              afterResults.push({ fieldPath, value: transformResult, type: "success" });
            }
          } catch (error) {
            console.error(`\u274C Sync afterTransform error for field ${fieldPath}:`, error);
            afterResults.push({ fieldPath, value: currentValue, type: "error" });
          }
        }
        const hasAsyncAfterTransforms = afterResults.some(
          (result) => result && typeof result.then === "function"
        );
        let resolvedAfterResults;
        if (hasAsyncAfterTransforms) {
          resolvedAfterResults = await Promise.all(afterResults);
        } else {
          resolvedAfterResults = afterResults;
        }
        resolvedAfterResults.forEach(({ fieldPath, value, type }) => {
          if (type === "success") {
            this.setNestedValue(mappedResult, fieldPath, value);
          }
        });
        return mappedResult;
      }
    };
    module2.exports = DataMapper2;
  }
});

// lib/vendors/salesforce/SalesforceApi.js
var require_SalesforceApi = __commonJS({
  "lib/vendors/salesforce/SalesforceApi.js"(exports2, module2) {
    function idRequired(id) {
      if (!id) {
        throw new Error('"id" is required for this operation');
      }
    }
    function handleSalesforceAxiosError(err, context = "Salesforce operation") {
      let errorMessage = "Unknown error";
      let errorDetails = null;
      let shouldInvalidateToken = false;
      let errorType = "unknown";
      let statusCode = null;
      if (err.response) {
        errorType = "http";
        statusCode = err.response.status;
        errorMessage = err.response.statusText || "HTTP error";
        if (err.response.data) {
          if (Array.isArray(err.response.data) && err.response.data.length > 0) {
            const firstError = err.response.data[0];
            if (firstError.errorCode === "INVALID_SESSION_ID" || firstError.errorCode === "INVALID_LOGIN" || firstError.errorCode === "SESSION_EXPIRED") {
              shouldInvalidateToken = true;
              console.log(`\u{1F511} Detected token invalidation error: ${firstError.errorCode}`);
            }
          }
        }
        if (err.response.data) {
          errorDetails = err.response.data;
          if (Array.isArray(err.response.data) && err.response.data[0]) {
            const firstError = err.response.data[0];
            errorMessage = firstError.message || firstError.errorCode || errorMessage;
            if (firstError.errorCode === "MALFORMED_QUERY") {
              errorMessage = `SOQL Query Error: ${firstError.message}`;
            }
          } else if (err.response.data.error_description) {
            errorMessage = err.response.data.error_description;
          } else if (err.response.data.error) {
            errorMessage = err.response.data.error;
          } else if (err.response.data.message) {
            errorMessage = err.response.data.message;
          }
        }
      } else if (err.request) {
        errorType = "network";
        errorMessage = "No response from server";
      } else {
        errorType = "config";
        errorMessage = err.message || "Unknown error";
      }
      const salesforceError = new Error(`${context} failed: ${errorMessage}`);
      salesforceError.statusCode = statusCode;
      throw salesforceError;
    }
    var SalesforceApi2 = class {
      constructor({ instanceUrl, customerKey, customerSecret, apiVersion = "58.0", sandbox = false, env: env2 = "default" } = {}) {
        if (!instanceUrl) throw new Error("instanceUrl is required");
        if (!customerKey) throw new Error("customerKey is required");
        if (!customerSecret) throw new Error("customerSecret is required");
        this.customerKey = customerKey;
        this.customerSecret = customerSecret;
        this.apiVersion = apiVersion;
        this.sandbox = sandbox;
        this.tokenKey = `salesforce-token-${env2}`;
        this.isServerEnvironment = typeof globalThis.setVariable === "function" && typeof globalThis.variables !== "undefined";
        if (this.isServerEnvironment) {
          const tokenFound = globalThis.variables.find((v) => v.key === this.tokenKey);
          this.tokenValue = tokenFound ? JSON.parse(tokenFound.value) : null;
        } else {
          this.tokenValue = null;
        }
        this.instanceUrl = instanceUrl;
        this.TOKEN_REFRESH_BUFFER = 5 * 60 * 1e3;
        this.retryOnTokenError = true;
        this.maxRetries = 1;
        let baseURL = instanceUrl;
        if (!/^https?:\/\//.test(baseURL)) {
          baseURL = `https://${baseURL}`;
        }
        this.authUrl = baseURL.replace(".lightning.force.com", ".my.salesforce.com");
        this.axios = axios.create({
          baseURL,
          // This will be updated after auth
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          }
        });
        this.accessToken = null;
        this.authenticated = false;
      }
      // Enhanced authentication method with smart token caching
      async authenticate() {
        try {
          if (await this.isTokenValid()) {
            this.accessToken = this.tokenValue.access_token;
            this.authenticated = true;
            this.updateAxiosHeaders();
            return this.accessToken;
          }
          return await this.refreshToken();
        } catch (err) {
          await this.clearTokenCache();
          const errorObj = handleSalesforceAxiosError(err, "Authentication");
          throw errorObj;
        }
      }
      // Check if current token is valid and not near expiration
      async isTokenValid() {
        if (!this.tokenValue || !this.tokenValue.access_token || !this.tokenValue.issued_at) {
          return false;
        }
        const now = Date.now();
        const issuedAt = parseInt(this.tokenValue.issued_at);
        const tokenLifetime = 5400 * 1e3;
        const expirationTime = issuedAt + tokenLifetime;
        const refreshTime = expirationTime - this.TOKEN_REFRESH_BUFFER;
        const isValid = now < refreshTime;
        return isValid;
      }
      // Get new token and cache it
      async refreshToken() {
        try {
          const response = await axios.post(
            `${this.authUrl}/services/oauth2/token`,
            `grant_type=client_credentials&client_id=${encodeURIComponent(this.customerKey)}&client_secret=${encodeURIComponent(this.customerSecret)}`,
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
              }
            }
          );
          const tokenResponse = {
            ...response.data,
            cached_at: Date.now()
            // Add our own timestamp for better tracking
          };
          if (this.isServerEnvironment) {
            await globalThis.setVariable(this.tokenKey, JSON.stringify(tokenResponse));
          }
          this.tokenValue = tokenResponse;
          this.accessToken = tokenResponse.access_token;
          this.authenticated = true;
          this.updateAxiosConfiguration(response.data);
          return this.accessToken;
        } catch (err) {
          const errorObj = handleSalesforceAxiosError(err, "Salesforce token refresh");
          console.log("\u274C Token refresh failed:", errorObj.toString());
          throw errorObj;
        }
      }
      // Update axios instance configuration
      updateAxiosConfiguration(tokenData) {
        if (tokenData.instance_url) {
          this.axios.defaults.baseURL = tokenData.instance_url;
        }
        this.updateAxiosHeaders();
      }
      // Update axios headers with current token
      updateAxiosHeaders() {
        if (this.accessToken) {
          this.axios.defaults.headers.Authorization = `Bearer ${this.accessToken}`;
        }
      }
      // Clear token cache
      async clearTokenCache() {
        try {
          if (this.isServerEnvironment) {
            await globalThis.setVariable(this.tokenKey, "");
          } else {
            console.log("\u{1F527} Token cache cleared from memory (local environment)");
          }
          this.tokenValue = null;
          this.accessToken = null;
          this.authenticated = false;
          delete this.axios.defaults.headers.Authorization;
        } catch (err) {
          const errorObj = handleSalesforceAxiosError(err, "Clear token cache");
          console.log("Warning: Failed to clear token cache:", errorObj.toString());
        }
      }
      // Handle token invalidation from error responses
      async handleTokenInvalidation(errorObj) {
        if (errorObj.shouldInvalidateToken) {
          console.log("\u{1F511} Token invalidated by Salesforce, clearing cache...");
          await this.clearTokenCache();
          return true;
        }
        return false;
      }
      // Execute method with automatic token retry
      async executeWithRetry(operation, context = "Operation") {
        let attempt = 0;
        while (attempt <= this.maxRetries) {
          try {
            return await operation();
          } catch (err) {
            const salesforceError = handleSalesforceAxiosError(err, context);
            if (this.retryOnTokenError && attempt < this.maxRetries) {
              const tokenInvalidated = await this.handleTokenInvalidation(salesforceError);
              if (tokenInvalidated) {
                attempt++;
                continue;
              }
            }
            throw salesforceError;
          }
        }
      }
      // Method to force token refresh (useful for testing or manual refresh)
      async forceRefresh() {
        await this.clearTokenCache();
        return await this.authenticate();
      }
      // Method to get token info for debugging
      getTokenInfo() {
        if (!this.tokenValue) {
          return { status: "No token cached" };
        }
        const now = Date.now();
        const issuedAt = parseInt(this.tokenValue.issued_at);
        const tokenLifetime = 5400 * 1e3;
        const expirationTime = issuedAt + tokenLifetime;
        const timeUntilExpiration = expirationTime - now;
        return {
          status: "Token cached",
          issuedAt: new Date(issuedAt).toISOString(),
          expiresAt: new Date(expirationTime).toISOString(),
          timeUntilExpiration: `${Math.round(timeUntilExpiration / 1e3 / 60)} minutes`,
          isValid: timeUntilExpiration > this.TOKEN_REFRESH_BUFFER
        };
      }
      /**
       * Creates a new Salesforce record
       * 
       * @param {string} sobjectType - Salesforce object type (e.g., 'Contact', 'Account', 'Opportunity')
       * @param {Object} data - Record data to create (field-value pairs)
       * 
       * @returns {Promise<Object>} Creation result with new record ID and success status
       * @returns {string} returns.id - ID of the newly created record
       * @returns {boolean} returns.success - Whether the creation was successful
       * @returns {Object[]} [returns.errors] - Array of error details if creation failed
       * 
       * @throws {Error} For validation errors, permission issues, or network problems
       * 
       * @example
       * // Create a new contact
       * const newContact = await sfApi.create('Contact', {
       *   FirstName: 'Jane',
       *   LastName: 'Smith',
       *   Email: 'jane.smith@example.com',
       *   Phone: '+1-555-0123',
       *   AccountId: '001XXXXXXXXXXXX'
       * });
       * console.log(`Created contact with ID: ${newContact.id}`);
       * 
       * @example
       * // Create an opportunity with required fields
       * const opportunity = await sfApi.create('Opportunity', {
       *   Name: 'Q4 Software License Deal',
       *   AccountId: '001XXXXXXXXXXXX',
       *   StageName: 'Prospecting',
       *   CloseDate: '2024-12-31',
       *   Amount: 50000,
       *   Probability: 25
       * });
       * 
       * @example
       * // Handle creation with error checking
       * try {
       *   const result = await sfApi.create('Account', {
       *     Name: 'Acme Corporation',
       *     Industry: 'Technology',
       *     Type: 'Prospect'
       *   });
       *   
       *   if (result.success) {
       *     console.log('Account created successfully');
       *   }
       * } catch (error) {
       *   console.error('Failed to create account:', error.message);
       * }
       */
      async create(sobjectType, data) {
        return await this.executeWithRetry(async () => {
          if (!this.authenticated) {
            await this.authenticate();
          }
          const response = await this.axios.post(`/services/data/v${this.apiVersion}/sobjects/${sobjectType}`, data, {
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "Accept": "application/json",
              "Content-Type": "application/json"
            }
          });
          return response.data;
        }, "Create record");
      }
      /**
       * Queries Salesforce records using SOQL (Salesforce Object Query Language)
       * 
       * @param {string} sobjectType - Salesforce object type (e.g., 'Contact', 'Account', 'Opportunity')
       * @param {Object} options - Query options for filtering, selection and sorting
       * @param {string} [options.select='Id'] - Comma-separated field names to select
       * @param {string} [options.where] - WHERE clause conditions (without the WHERE keyword)
       * @param {string} [options.orderBy] - ORDER BY clause (without the ORDER BY keyword)
       * @param {number|string} [options.limit] - Maximum number of records to return
       * 
       * @returns {Promise<Object>} Query result with totalSize, done flag, and records array
       * 
       * @throws {Error} For invalid options, authentication failures, or network problems
       * 
       * @example
       * // Basic query with minimal options
       * const result = await sfApi.find('Contact');
       * 
       * @example
       * // Complex query with all options
       * const contacts = await sfApi.find('Contact', {
       *   where: "LastName = 'Doe' AND Email != null",
       *   select: 'Id, FirstName, LastName, Email, CreatedDate',
       *   orderBy: 'CreatedDate DESC',
       *   limit: 10
       * });
       * 
       * @example
       * // Example response structure:
       * // {
       * //   "totalSize": 1,
       * //   "done": true,
       * //   "records": [
       * //     {
       * //       "attributes": {
       * //         "type": "Contact",
       * //         "url": "/services/data/v58.0/sobjects/Contact/003XXXXXXXXXXXX"
       * //       },
       * //       "Id": "003XXXXXXXXXXXX",
       * //       "FirstName": "John",
       * //       "LastName": "Doe",
       * //       "Email": "john.doe@example.com",
       * //       "CreatedDate": "2024-06-30T12:34:56.000+0000"
       * //     }
       * //   ]
       * // }
       */
      async find(sobjectType, options = {}) {
        return await this.executeWithRetry(async () => {
          if (!this.authenticated) {
            await this.authenticate();
          }
          for (const key of ["select", "where", "orderBy", "limit"]) {
            if (options[key] !== void 0 && typeof options[key] !== "string" && typeof options[key] !== "number") {
              throw new Error(`Invalid type for option "${key}". Expected string or number.`);
            }
          }
          let select = options.select || "Id";
          if (typeof select === "string") {
            select = select.replace(/\s+/g, ",").replace(/,+/g, ",");
          }
          let soql = `SELECT ${select} FROM ${sobjectType}`;
          if (options.where) soql += ` WHERE ${options.where}`;
          if (options.orderBy) soql += ` ORDER BY ${options.orderBy}`;
          if (options.limit) soql += ` LIMIT ${options.limit}`;
          const response = await this.axios.get(`/services/data/v${this.apiVersion}/query?q=${encodeURIComponent(soql)}`, {
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "Accept": "application/json"
            }
          });
          return response.data;
        }, "Query");
      }
      /**
       * Retrieves a single Salesforce record by its unique ID
       * 
       * @param {string} sobjectType - Salesforce object type (e.g., 'Contact', 'Account', 'Opportunity') 
       * @param {string} id - Salesforce record ID (15 or 18 character format)
       * @param {Object} options - Field selection options
       * @param {string} [options.select='Id'] - Comma-separated field names to retrieve
       * 
       * @returns {Promise<Object|null>} Record data if found, null if record doesn't exist (404)
       * 
       * @throws {Error} For invalid parameters, authentication failures, or other API errors (excluding 404)
       * 
       * @example
       * // Get basic contact information
       * const contact = await sfApi.findOne('Contact', '003XXXXXXXXXXXX');
       * 
       * @example
       * // Get specific fields from an opportunity
       * const opportunity = await sfApi.findOne('Opportunity', '006XXXXXXXXXXXX', {
       *   select: 'Id, Name, StageName, Amount, CloseDate, AccountId'
       * });
       * 
       * @example
       * // Handle case when record doesn't exist
       * const contact = await sfApi.findOne('Contact', 'invalid_id');
       * if (contact === null) {
       *   console.log('Contact not found');
       * } else {
       *   console.log('Found contact:', contact.FirstName, contact.LastName);
       * }
       * 
       * @example
       * // Example response when record exists:
       * // {
       * //   "Id": "003XXXXXXXXXXXX",
       * //   "FirstName": "John", 
       * //   "LastName": "Doe",
       * //   "Email": "john.doe@example.com"
       * // }
       */
      async findOne(sobjectType, id, options = {}) {
        try {
          return await this.executeWithRetry(async () => {
            if (!this.authenticated) {
              await this.authenticate();
            }
            idRequired(id);
            let select = options.select || "Id";
            if (typeof select === "string") {
              select = select.replace(/\s+/g, ",").replace(/,+/g, ",");
            }
            const response = await this.axios.get(`/services/data/v${this.apiVersion}/sobjects/${sobjectType}/${id}?fields=${encodeURIComponent(select)}`, {
              headers: {
                "Authorization": `Bearer ${this.accessToken}`,
                "Accept": "application/json"
              }
            });
            return response.data;
          }, "Find single record");
        } catch (err) {
          if (err.statusCode === 404) {
            return null;
          }
          throw err;
        }
      }
      /**
       * Updates an existing Salesforce record
       * 
       * @param {string} sobjectType - Salesforce object type (e.g., 'Contact', 'Account', 'Opportunity')
       * @param {string} id - Salesforce record ID to update (15 or 18 character)
       * @param {Object} data - Updated field values (only changed fields need to be included)
       * 
       * @returns {Promise<void>} Resolves on successful update (HTTP 204 No Content)
       * 
       * @throws {Error} For validation errors, record not found, permission issues, or network problems
       * 
       * @example
       * // Update contact information
       * await sfApi.update('Contact', '003XXXXXXXXXXXX', {
       *   Phone: '+1-555-9876',
       *   Email: 'john.doe.updated@example.com',
       *   MailingCity: 'San Francisco'
       * });
       * 
       * @example
       * // Update opportunity stage and amount
       * await sfApi.update('Opportunity', '006XXXXXXXXXXXX', {
       *   StageName: 'Negotiation/Review',
       *   Amount: 75000,
       *   Probability: 80,
       *   CloseDate: '2024-03-15'
       * });
       * 
       * @example
       * // Conditional update with error handling
       * try {
       *   const accountId = '001XXXXXXXXXXXX';
       *   const updates = {
       *     Industry: 'Healthcare',
       *     NumberOfEmployees: 500,
       *     AnnualRevenue: 10000000
       *   };
       *   
       *   await sfApi.update('Account', accountId, updates);
       *   console.log('Account updated successfully');
       * } catch (error) {
       *   if (error.message.includes('404')) {
       *     console.error('Account not found');
       *   } else {
       *     console.error('Update failed:', error.message);
       *   }
       * }
       */
      async update(sobjectType, id, data) {
        return await this.executeWithRetry(async () => {
          if (!this.authenticated) {
            await this.authenticate();
          }
          idRequired(id);
          await this.axios.patch(`/services/data/v${this.apiVersion}/sobjects/${sobjectType}/${id}`, data, {
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "Accept": "application/json",
              "Content-Type": "application/json"
            }
          });
          return { success: true };
        }, "Update record");
      }
      /**
       * Permanently deletes a Salesforce record by its unique ID
       * 
       * @param {string} sobjectType - Salesforce object type (e.g., 'Contact', 'Account', 'Opportunity')
       * @param {string} id - Salesforce record ID to delete (15 or 18 character format)
       * 
       * @returns {Promise<Object>} Success confirmation object { success: true }
       * 
       * @throws {Error} For invalid ID, record not found, permission issues, or network problems
       * 
       * @example
       * // Delete a contact record
       * try {
       *   const result = await sfApi.delete('Contact', '003XXXXXXXXXXXX');
       *   console.log('Record deleted successfully:', result.success);
       * } catch (error) {
       *   console.error('Failed to delete record:', error.message);
       * }
       * 
       * @example
       * // Delete an opportunity
       * await sfApi.delete('Opportunity', '006XXXXXXXXXXXX');
       * 
       * @warning This operation is permanent and cannot be undone unless your Salesforce org has the Recycle Bin feature enabled
       * 
       * @see {@link https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_delete.htm|Salesforce REST API Delete Documentation}
       */
      async delete(sobjectType, id) {
        return await this.executeWithRetry(async () => {
          if (!this.authenticated) {
            await this.authenticate();
          }
          idRequired(id);
          await this.axios.delete(`/services/data/v${this.apiVersion}/sobjects/${sobjectType}/${id}`, {
            headers: {
              "Authorization": `Bearer ${this.accessToken}`,
              "Accept": "application/json"
            }
          });
          return { success: true };
        }, "Delete record");
      }
    };
    module2.exports = SalesforceApi2;
  }
});

// lib/vendors/prolibu/utils.js
var require_utils = __commonJS({
  "lib/vendors/prolibu/utils.js"(exports2, module2) {
    function handleAxiosError(err) {
      let errorObj;
      if (err.response) {
        let errorMessage = err.response.statusText || "HTTP error";
        if (err.response.data && err.response.data.error) {
          errorMessage = err.response.data.error;
        }
        errorObj = {
          type: "http",
          status: err.response.status,
          message: errorMessage,
          details: err.response.data || null
        };
      } else if (err.request) {
        errorObj = {
          type: "network",
          status: null,
          message: "No response from server",
          details: null
        };
      } else {
        errorObj = {
          type: "unknown",
          status: null,
          message: err.message || "Unknown error",
          details: null
        };
      }
      errorObj.toString = function() {
        return `[${this.type}${this.status ? " " + this.status : ""}] ${this.message}` + (this.details ? ` | Details: ${JSON.stringify(this.details)}` : "");
      };
      return errorObj;
    }
    module2.exports = { handleAxiosError };
  }
});

// lib/vendors/prolibu/ProlibuApi.js
var require_ProlibuApi = __commonJS({
  "lib/vendors/prolibu/ProlibuApi.js"(exports2, module2) {
    var { handleAxiosError } = require_utils();
    function stringify(obj, key) {
      if (obj?.[key]) {
        obj[key] = JSON.stringify(obj[key]);
      }
    }
    function validateId(id) {
      if (!id || typeof id !== "string") {
        throw new Error(`Invalid id "${id}". It must be a string.`);
      }
    }
    var ProlibuApi2 = class {
      constructor({ domain, apiKey }) {
        if (!domain) domain = localDomain;
        if (!domain) throw new Error("domain is required");
        if (!apiKey) throw new Error("apiKey is required");
        this.prefix = "/v2";
        let baseURL = domain;
        if (!/^https?:\/\//.test(baseURL)) {
          baseURL = `https://${baseURL}`;
        }
        this.axios = axios.create({
          baseURL,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
            "user-agent": "ProlibuApi"
          }
        });
      }
      async create(modelName, data) {
        try {
          const response = await this.axios.post(`${this.prefix}/${modelName}`, data);
          return response.data;
        } catch (err) {
          throw handleAxiosError(err);
        }
      }
      async findOne(modelName, id, queryParams = {}) {
        try {
          validateId(id);
          stringify(queryParams, "populatePath");
          const queryString = new URLSearchParams(queryParams).toString();
          const response = await this.axios.get(`${this.prefix}/${modelName}/${id}?${queryString}`);
          return response.data;
        } catch (err) {
          if (err.response && err.response.status === 404) {
            return null;
          }
          throw handleAxiosError(err);
        }
      }
      async find(modelName, queryParams = {}) {
        try {
          stringify(queryParams, "populatePath");
          stringify(queryParams, "xquery");
          const queryString = new URLSearchParams(queryParams).toString();
          const response = await this.axios.get(`${this.prefix}/${modelName}?${queryString}`);
          return response.data;
        } catch (err) {
          throw handleAxiosError(err);
        }
      }
      async update(modelName, id, data) {
        try {
          validateId(id);
          const response = await this.axios.patch(`${this.prefix}/${modelName}/${id}`, data);
          return response.data;
        } catch (err) {
          throw handleAxiosError(err);
        }
      }
      async delete(modelName, id) {
        try {
          validateId(id);
          const response = await this.axios.delete(`${this.prefix}/${modelName}/${id}`);
          return response.data;
        } catch (err) {
          throw handleAxiosError(err);
        }
      }
      async search(modelName, term, queryParams = {}) {
        try {
          stringify(queryParams, "populatePath");
          stringify(queryParams, "xquery");
          const queryString = new URLSearchParams({ ...queryParams, term }).toString();
          const response = await this.axios.get(`${this.prefix}/${modelName}/search?${queryString}`);
          return response.data;
        } catch (err) {
          throw handleAxiosError(err);
        }
      }
      async findOneOrCreate(entity, id, options = {}, data) {
        if (!data) {
          throw new Error(`Data as fourth argument is required when using findOneOrCreate`);
        }
        let record = await this.findOne(entity, id, options);
        if (record) {
          return record;
        }
        record = await this.create(entity, data);
        return record;
      }
    };
    module2.exports = ProlibuApi2;
  }
});

// lib/utils/variables.js
var require_variables = __commonJS({
  "lib/utils/variables.js"(exports2, module2) {
    function getVariable(key) {
      if (!Array.isArray(variables)) return void 0;
      const found = variables.find((v) => v.key === key);
      return found ? found.value : void 0;
    }
    function getRequiredVars2(requiredVarsObj) {
      const keys = Object.keys(requiredVarsObj);
      const missingVars = [];
      const result = {};
      keys.forEach((key) => {
        const variableName = requiredVarsObj[key];
        const value = getVariable(variableName);
        if (!value) {
          missingVars.push(`'${variableName}'`);
        } else {
          result[key] = value;
        }
      });
      if (missingVars.length > 0) {
        throw new Error(`Missing required variables: ${missingVars.join(", ")}`);
      }
      return result;
    }
    module2.exports = { getVariable, getRequiredVars: getRequiredVars2 };
  }
});

// lib/vendors/salesforce/dictionaries/Countries.js
var require_Countries = __commonJS({
  "lib/vendors/salesforce/dictionaries/Countries.js"(exports2, module2) {
    module2.exports = {
      "UZ": "Uzbekistan",
      "AT": "Austria",
      "SL": "Sierra Leone",
      "CC": "Cocos (Keeling) Islands",
      "MR": "Mauritania",
      "IL": "Israel",
      "MD": "Moldova",
      "FJ": "Fiji",
      "RS": "Serbia",
      "CM": "Cameroon",
      "BS": "Bahamas",
      "NR": "Nauru",
      "CZ": "Czechia",
      "EG": "Egypt",
      "MM": "Myanmar",
      "NL": "Netherlands",
      "UY": "Uruguay",
      "MP": "Northern Mariana Islands",
      "CF": "Central African Republic",
      "SH": "Saint Helena, Ascension and Tristan da Cunha",
      "GQ": "Equatorial Guinea",
      "CO": "Colombia",
      "KG": "Kyrgyzstan",
      "ES": "Spain",
      "MW": "Malawi",
      "HU": "Hungary",
      "MC": "Monaco",
      "CV": "Cape Verde",
      "ZA": "South Africa",
      "DK": "Denmark",
      "GP": "Guadeloupe",
      "IE": "Ireland",
      "MT": "Malta",
      "WF": "Wallis and Futuna",
      "SR": "Suriname",
      "VA": "Vatican City",
      "ML": "Mali",
      "TO": "Tonga",
      "SM": "San Marino",
      "BL": "Saint Barth\xE9lemy",
      "GI": "Gibraltar",
      "CA": "Canada",
      "BJ": "Benin",
      "GU": "Guam",
      "KP": "North Korea",
      "TV": "Tuvalu",
      "PA": "Panama",
      "RW": "Rwanda",
      "CG": "Republic of the Congo",
      "JM": "Jamaica",
      "BH": "Bahrain",
      "SX": "Sint Maarten",
      "TC": "Turks and Caicos Islands",
      "PK": "Pakistan",
      "KZ": "Kazakhstan",
      "LA": "Laos",
      "TT": "Trinidad and Tobago",
      "ME": "Montenegro",
      "NU": "Niue",
      "LR": "Liberia",
      "GD": "Grenada",
      "PG": "Papua New Guinea",
      "TD": "Chad",
      "CL": "Chile",
      "PR": "Puerto Rico",
      "SA": "Saudi Arabia",
      "NO": "Norway",
      "GM": "Gambia",
      "PH": "Philippines",
      "IM": "Isle of Man",
      "PT": "Portugal",
      "HN": "Honduras",
      "CY": "Cyprus",
      "AI": "Anguilla",
      "TG": "Togo",
      "LB": "Lebanon",
      "MA": "Morocco",
      "EE": "Estonia",
      "FO": "Faroe Islands",
      "AR": "Argentina",
      "GA": "Gabon",
      "NA": "Namibia",
      "VN": "Vietnam",
      "GR": "Greece",
      "VG": "British Virgin Islands",
      "MZ": "Mozambique",
      "NF": "Norfolk Island",
      "GS": "South Georgia",
      "AM": "Armenia",
      "KE": "Kenya",
      "BT": "Bhutan",
      "AE": "United Arab Emirates",
      "CK": "Cook Islands",
      "ET": "Ethiopia",
      "SG": "Singapore",
      "PE": "Peru",
      "PS": "Palestine",
      "WS": "Samoa",
      "SS": "South Sudan",
      "AD": "Andorra",
      "MF": "Saint Martin",
      "SZ": "Eswatini",
      "TJ": "Tajikistan",
      "ZM": "Zambia",
      "US": "United States",
      "BI": "Burundi",
      "JP": "Japan",
      "CW": "Cura\xE7ao",
      "UG": "Uganda",
      "MN": "Mongolia",
      "NG": "Nigeria",
      "GT": "Guatemala",
      "JE": "Jersey",
      "CR": "Costa Rica",
      "YE": "Yemen",
      "GL": "Greenland",
      "MG": "Madagascar",
      "DZ": "Algeria",
      "BE": "Belgium",
      "LK": "Sri Lanka",
      "FI": "Finland",
      "BM": "Bermuda",
      "MK": "North Macedonia",
      "VC": "Saint Vincent and the Grenadines",
      "NE": "Niger",
      "IO": "British Indian Ocean Territory",
      "LV": "Latvia",
      "NP": "Nepal",
      "CI": "Ivory Coast",
      "LI": "Liechtenstein",
      "CD": "DR Congo",
      "BZ": "Belize",
      "QA": "Qatar",
      "TK": "Tokelau",
      "ID": "Indonesia",
      "PF": "French Polynesia",
      "LS": "Lesotho",
      "PL": "Poland",
      "PW": "Palau",
      "GG": "Guernsey",
      "AG": "Antigua and Barbuda",
      "PM": "Saint Pierre and Miquelon",
      "XK": "Kosovo",
      "EH": "Western Sahara",
      "LU": "Luxembourg",
      "TW": "Taiwan",
      "HK": "Hong Kong",
      "TM": "Turkmenistan",
      "RU": "Russia",
      "AZ": "Azerbaijan",
      "EC": "Ecuador",
      "KH": "Cambodia",
      "YT": "Mayotte",
      "BW": "Botswana",
      "HR": "Croatia",
      "LC": "Saint Lucia",
      "PY": "Paraguay",
      "BO": "Bolivia",
      "MV": "Maldives",
      "AS": "American Samoa",
      "IS": "Iceland",
      "SK": "Slovakia",
      "TF": "French Southern and Antarctic Lands",
      "BN": "Brunei",
      "KN": "Saint Kitts and Nevis",
      "AF": "Afghanistan",
      "GH": "Ghana",
      "KW": "Kuwait",
      "SJ": "Svalbard and Jan Mayen",
      "BD": "Bangladesh",
      "GY": "Guyana",
      "KI": "Kiribati",
      "BB": "Barbados",
      "AL": "Albania",
      "PN": "Pitcairn Islands",
      "BF": "Burkina Faso",
      "MO": "Macau",
      "SC": "Seychelles",
      "CH": "Switzerland",
      "KR": "South Korea",
      "VI": "United States Virgin Islands",
      "TN": "Tunisia",
      "IR": "Iran",
      "JO": "Jordan",
      "RE": "R\xE9union",
      "TR": "Turkey",
      "TZ": "Tanzania",
      "UA": "Ukraine",
      "MU": "Mauritius",
      "SO": "Somalia",
      "GN": "Guinea",
      "GF": "French Guiana",
      "MH": "Marshall Islands",
      "SB": "Solomon Islands",
      "UM": "United States Minor Outlying Islands",
      "LT": "Lithuania",
      "SI": "Slovenia",
      "NI": "Nicaragua",
      "DO": "Dominican Republic",
      "IQ": "Iraq",
      "SV": "El Salvador",
      "VE": "Venezuela",
      "ZW": "Zimbabwe",
      "SE": "Sweden",
      "TH": "Thailand",
      "TL": "Timor-Leste",
      "BA": "Bosnia and Herzegovina",
      "GW": "Guinea-Bissau",
      "MS": "Montserrat",
      "DM": "Dominica",
      "FK": "Falkland Islands",
      "BQ": "Caribbean Netherlands",
      "DJ": "Djibouti",
      "HT": "Haiti",
      "KM": "Comoros",
      "IT": "Italy",
      "BY": "Belarus",
      "KY": "Cayman Islands",
      "FR": "France",
      "SN": "Senegal",
      "CN": "China",
      "SD": "Sudan",
      "OM": "Oman",
      "GB": "United Kingdom",
      "MX": "Mexico",
      "AU": "Australia",
      "CU": "Cuba",
      "ER": "Eritrea",
      "BG": "Bulgaria",
      "RO": "Romania",
      "FM": "Micronesia",
      "VU": "Vanuatu",
      "SY": "Syria",
      "ST": "S\xE3o Tom\xE9 and Pr\xEDncipe",
      "DE": "Germany",
      "NZ": "New Zealand",
      "AO": "Angola",
      "CX": "Christmas Island",
      "AW": "Aruba",
      "IN": "India",
      "MY": "Malaysia",
      "GE": "Georgia",
      "NC": "New Caledonia",
      "LY": "Libya",
      "AX": "\xC5land Islands",
      "MQ": "Martinique",
      "BR": "Brazil"
    };
  }
});

// lib/vendors/salesforce/dictionaries/StateUS.js
var require_StateUS = __commonJS({
  "lib/vendors/salesforce/dictionaries/StateUS.js"(exports2, module2) {
    module2.exports = {
      "AL": "Alabama",
      "AK": "Alaska",
      "AZ": "Arizona",
      "AR": "Arkansas",
      "CA": "California",
      "CO": "Colorado",
      "CT": "Connecticut",
      "DE": "Delaware",
      "FL": "Florida",
      "GA": "Georgia",
      "HI": "Hawaii",
      "ID": "Idaho",
      "IL": "Illinois",
      "IN": "Indiana",
      "IA": "Iowa",
      "KS": "Kansas",
      "KY": "Kentucky",
      "LA": "Louisiana",
      "ME": "Maine",
      "MD": "Maryland",
      "MA": "Massachusetts",
      "MI": "Michigan",
      "MN": "Minnesota",
      "MS": "Mississippi",
      "MO": "Missouri",
      "MT": "Montana",
      "NE": "Nebraska",
      "NV": "Nevada",
      "NH": "New Hampshire",
      "NJ": "New Jersey",
      "NM": "New Mexico",
      "NY": "New York",
      "NC": "North Carolina",
      "ND": "North Dakota",
      "OH": "Ohio",
      "OK": "Oklahoma",
      "OR": "Oregon",
      "PA": "Pennsylvania",
      "RI": "Rhode Island",
      "SC": "South Carolina",
      "SD": "South Dakota",
      "TN": "Tennessee",
      "TX": "Texas",
      "UT": "Utah",
      "VT": "Vermont",
      "VA": "Virginia",
      "WA": "Washington",
      "WV": "West Virginia",
      "WI": "Wisconsin",
      "WY": "Wyoming"
    };
  }
});

// lib/vendors/salesforce/maps/CompanyMap.js
var require_CompanyMap = __commonJS({
  "lib/vendors/salesforce/maps/CompanyMap.js"(exports2, module2) {
    var Countries = require_Countries();
    var States = {
      US: require_StateUS()
    };
    module2.exports = {
      // Basic mappings: prolibuField → salesforceField
      companyName: "Name",
      primaryPhone: "Phone",
      website: "Website",
      legalName: "Tradestyle",
      assignee: "OwnerId",
      // Nested address mappings
      "address.street": "BillingStreet",
      "address.city": "BillingCity",
      "address.state": "BillingState",
      "address.postalCode": "BillingPostalCode",
      "address.country": "BillingCountry",
      "address.location.lat": "BillingLatitude",
      "address.location.long": "BillingLongitude",
      "locale.currency": "CurrencyIsoCode",
      // Transformations
      transforms: {
        // FORWARD TRANSFORMS (Prolibu → Salesforce)
        // Transform for BillingStreet - combines street + neighborhood
        BillingStreet: (value, sourceData) => {
          if (!value) return value;
          const neighborhood = sourceData?.address?.neighborhood;
          if (neighborhood) {
            return `${value}, ${neighborhood}`;
          }
          return value;
        },
        // Transform for BillingCountry - normalize country codes using Countries dictionary
        BillingCountry: (value, sourceData) => {
          if (!value) return void 0;
          const upperValue = value.toString().toUpperCase();
          return Countries[upperValue] || void 0;
        },
        // Transform for BillingState - dynamic state handling based on country code
        BillingState: (value, sourceData) => {
          if (!value) return void 0;
          const countryCode = sourceData?.address?.country?.toUpperCase();
          if (!countryCode) return void 0;
          if (States[countryCode]) {
            const upperState = value.toString().toUpperCase();
            return States[countryCode][upperState] || void 0;
          }
          return void 0;
        },
        // Transform for coordinates
        BillingLatitude: (value) => {
          if (!value || isNaN(value)) return null;
          return parseFloat(value);
        },
        BillingLongitude: (value) => {
          if (!value || isNaN(value)) return null;
          return parseFloat(value);
        },
        // REVERSE TRANSFORMS (Salesforce → Prolibu)
        // Reverse transform for address.street - extract street from combined value
        "address.street": (value) => {
          if (!value) return value;
          const commaIndex = value.indexOf(",");
          if (commaIndex > 0) {
            return value.substring(0, commaIndex).trim();
          }
          return value;
        },
        // Reverse transform for address.country - convert full country name back to code
        "address.country": (value) => {
          if (!value) return void 0;
          for (const [code, countryName] of Object.entries(Countries)) {
            if (countryName === value) {
              return code;
            }
          }
          return void 0;
        },
        // Reverse transform for address.state - convert full state name back to code
        "address.state": (value, sourceData) => {
          if (!value) return void 0;
          const country = sourceData?.BillingCountry;
          if (!country) return void 0;
          let countryCode = null;
          for (const [code, countryName] of Object.entries(Countries)) {
            if (countryName === country) {
              countryCode = code;
              break;
            }
          }
          if (countryCode && States[countryCode]) {
            for (const [code, stateName] of Object.entries(States[countryCode])) {
              if (stateName === value) {
                return code;
              }
            }
          }
          return void 0;
        }
      }
    };
  }
});

// lib/vendors/salesforce/maps/ContactMap.js
var require_ContactMap = __commonJS({
  "lib/vendors/salesforce/maps/ContactMap.js"(exports2, module2) {
    var Countries = require_Countries();
    var States = {
      US: require_StateUS()
    };
    module2.exports = {
      // Basic mappings: prolibuField → salesforceField
      firstName: "FirstName",
      lastName: "LastName",
      email: "Email",
      jobTitle: "Title",
      mobile: "MobilePhone",
      assignee: "OwnerId",
      // Nested address mappings
      "address.street": "MailingStreet",
      "address.city": "MailingCity",
      "address.state": "MailingState",
      "address.postalCode": "MailingPostalCode",
      "address.country": "MailingCountry",
      "address.location.lat": "MailingLatitude",
      "address.location.long": "MailingLongitude",
      // Transformations
      transforms: {
        // FORWARD TRANSFORMS (Prolibu → Salesforce)
        // Transform for MailingStreet - combines street + neighborhood
        MailingStreet: (value, sourceData) => {
          if (!value) return value;
          const neighborhood = sourceData?.address?.neighborhood;
          if (neighborhood) {
            return `${value}, ${neighborhood}`;
          }
          return value;
        },
        // Transform for MailingCountry - normalize country codes using Countries dictionary
        MailingCountry: (value, sourceData) => {
          if (!value) return void 0;
          const upperValue = value.toString().toUpperCase();
          return Countries[upperValue] || void 0;
        },
        // Transform for MailingState - dynamic state handling based on country code
        MailingState: (value, sourceData) => {
          if (!value) return void 0;
          const countryCode = sourceData?.address?.country?.toUpperCase();
          if (!countryCode) return void 0;
          if (States[countryCode]) {
            const upperState = value.toString().toUpperCase();
            return States[countryCode][upperState] || void 0;
          }
          return void 0;
        },
        // Transform for coordinates
        MailingLatitude: (value) => {
          if (!value || isNaN(value)) return null;
          return parseFloat(value);
        },
        MailingLongitude: (value) => {
          if (!value || isNaN(value)) return null;
          return parseFloat(value);
        },
        // REVERSE TRANSFORMS (Salesforce → Prolibu)
        // Reverse transform for address.street - extract street from combined value
        "address.street": (value) => {
          if (!value) return value;
          const commaIndex = value.indexOf(",");
          if (commaIndex > 0) {
            return value.substring(0, commaIndex).trim();
          }
          return value;
        },
        // Reverse transform for address.country - convert full country name back to code
        "address.country": (value) => {
          if (!value) return void 0;
          for (const [code, countryName] of Object.entries(Countries)) {
            if (countryName === value) {
              return code;
            }
          }
          return void 0;
        },
        // Reverse transform for address.state - convert full state name back to code
        "address.state": (value, sourceData) => {
          if (!value) return void 0;
          const country = sourceData?.MailingCountry;
          if (!country) return void 0;
          let countryCode = null;
          for (const [code, countryName] of Object.entries(Countries)) {
            if (countryName === country) {
              countryCode = code;
              break;
            }
          }
          if (countryCode && States[countryCode]) {
            for (const [code, stateName] of Object.entries(States[countryCode])) {
              if (stateName === value) {
                return code;
              }
            }
          }
          return void 0;
        }
      }
    };
  }
});

// lib/vendors/salesforce/maps/DealMap.js
var require_DealMap = __commonJS({
  "lib/vendors/salesforce/maps/DealMap.js"(exports2, module2) {
    module2.exports = {
      // Basic mappings: prolibuField → salesforceField
      dealName: "Name",
      closeDate: "CloseDate",
      assignee: "OwnerId",
      contact: "ContactId",
      company: "AccountId",
      stage: "StageName",
      source: "LeadSource"
      // Additional mappings
      // 'proposal.title': 'Description',
      /*
        transforms: {
          // FORWARD TRANSFORMS (Prolibu → Salesforce)
          
          // Transform for StageName - convert Stage ObjectId to Stage name
          StageName: async (value, sourceData, DataMapper) => {
            if (!value) return undefined;
            
            // If value is already a string (stage name), return it
            if (typeof value === 'string') return value;
            
            // If it's an ObjectId, we need to resolve it to stage name
            // This would require a lookup to the Stage collection
            // For now, return a default stage or the value as string
            return value.toString();
          },
          
          // Transform for Amount - extract from proposal.quote if available
          Amount: (value, sourceData) => {
            // If there's a direct amount field, use it
            if (value) return parseFloat(value);
            
            // Try to extract from proposal quote
            const quote = sourceData?.proposal?.quote;
            if (quote?.total) {
              return parseFloat(quote.total);
            }
            
            // Try to extract from proposal quote subtotal
            if (quote?.subtotal) {
              return parseFloat(quote.subtotal);
            }
            
            return null;
          },
          
          // Transform for Probability - calculate based on stage or set default
          Probability: (value, sourceData) => {
            if (value) return parseFloat(value);
            
            // Set default probability based on stage or other logic
            const stageName = sourceData?.stage;
            if (stageName) {
              // You could map stages to probabilities here
              // For now, return a default
              return 50;
            }
            
            return 10; // Default low probability
          },
          
          // Transform for Type - map from deal type or set default
          Type: (value, sourceData) => {
            if (value) return value;
            
            // Set default opportunity type
            return 'New Customer';
          },
          
          // Transform for CloseDate - ensure proper date format
          CloseDate: (value) => {
            if (!value) return null;
            
            // Convert to ISO date string for Salesforce
            const date = new Date(value);
            if (isNaN(date.getTime())) return null;
            
            return date.toISOString().split('T')[0]; // YYYY-MM-DD format
          },
          
          // Transform for Description - combine proposal title and other info
          Description: (value, sourceData) => {
            const parts = [];
            
            // Add proposal title if exists
            if (value) {
              parts.push(value);
            }
            
            // Add deal source if available
            if (sourceData?.source) {
              parts.push(`Source: ${sourceData.source}`);
            }
            
            // Add any tags if available
            if (sourceData?.tags && Array.isArray(sourceData.tags)) {
              const tagNames = sourceData.tags.map(tag => 
                typeof tag === 'string' ? tag : tag.name || tag.toString()
              ).filter(Boolean);
              
              if (tagNames.length > 0) {
                parts.push(`Tags: ${tagNames.join(', ')}`);
              }
            }
            
            return parts.length > 0 ? parts.join('\n\n') : null;
          },
          
          // REVERSE TRANSFORMS (Salesforce → Prolibu)
          
          // Reverse transform for dealName
          dealName: (value) => {
            return value || null;
          },
          
          // Reverse transform for closeDate
          closeDate: (value) => {
            if (!value) return null;
            
            const date = new Date(value);
            if (isNaN(date.getTime())) return null;
            
            return date;
          },
          
          // Reverse transform for proposal.title from Description
          'proposal.title': (value) => {
            if (!value) return null;
            
            // Extract the first line/part of the description as proposal title
            const lines = value.split('\n\n');
            if (lines.length > 0 && !lines[0].startsWith('Source:') && !lines[0].startsWith('Tags:')) {
              return lines[0];
            }
            
            return null;
          }
        }
      
        */
    };
  }
});

// accounts/dev11.prolibu.com/test-agox/code.js
var OutboundIntegration = require_OutboundIntegration();
var DataMapper = require_DataMapper();
var SalesforceApi = require_SalesforceApi();
var ProlibuApi = require_ProlibuApi();
var { getRequiredVars } = require_variables();
var vars = getRequiredVars({
  salesforceInstanceUrl: `salesforce-instanceUrl-${env}`,
  salesforceCustomerKey: `salesforce-customerKey-${env}`,
  salesforceCustomerSecret: `salesforce-customerSecret-${env}`,
  prolibuApiKey: `prolibu-apiKey-${env}`
});
(async function() {
  const prolibuApi = new ProlibuApi({ apiKey: vars.prolibuApiKey });
  const salesforceApi = new SalesforceApi({
    instanceUrl: vars.salesforceInstanceUrl,
    customerKey: vars.salesforceCustomerKey,
    customerSecret: vars.salesforceCustomerSecret
  });
  async function afterCreateWithDuplicateHandling(objectName, config) {
    try {
      const data = await DataMapper.map({
        data: eventData.doc,
        map: config.map,
        transforms: config.transforms,
        afterTransforms: config.afterTransforms
      });
      console.log("%c\u{1F7E2} [AGOX] data Mapeada", "color: green; font-weight: bold;", data);
      let result;
      if (data.Email) {
        console.log(`\u{1F50D} Buscando contact existente por email: ${data.Email}`);
        try {
          const existingContacts = await salesforceApi.find("Contact", {
            where: `Email = '${data.Email.replace(/'/g, "\\'")}'`,
            limit: 1,
            select: "Id"
          });
          console.log(`\u{1F4CA} Encontrados: ${existingContacts.totalSize} contactos existentes`);
          if (existingContacts.totalSize > 0) {
            result = { id: existingContacts.records[0].Id };
            console.log(`\u{1F4E7} Usando contact existente: ${result.id}`);
            try {
              await salesforceApi.update("Contact", result.id, data);
              console.log(`\u{1F504} Contact actualizado: ${result.id}`);
            } catch (updateError) {
              console.warn("Error actualizando contact:", updateError.message);
            }
          } else {
            console.log(`\u2728 Email \xFAnico, creando nuevo contact...`);
            try {
              result = await salesforceApi.create("Contact", data);
              console.log(`\u2705 Contact creado: ${result.id}`);
            } catch (createError) {
              console.error(`\u274C Error creando:`, createError.message);
              if (createError.message?.includes("duplicate")) {
                console.log("\u{1F504} Race condition detectada, buscando de nuevo...");
                const retrySearch = await salesforceApi.find("Contact", {
                  where: `Email = '${data.Email.replace(/'/g, "\\'")}'`,
                  limit: 1,
                  select: "Id"
                });
                if (retrySearch.totalSize > 0) {
                  result = { id: retrySearch.records[0].Id };
                  console.log(`\uFFFD Contact encontrado en retry: ${result.id}`);
                } else {
                  throw createError;
                }
              } else {
                throw createError;
              }
            }
          }
        } catch (searchError) {
          console.error("\u274C Error en b\xFAsqueda:", searchError.message);
          throw searchError;
        }
      } else {
        console.log("\u26A0\uFE0F Sin email, creando directamente...");
        result = await salesforceApi.create("Contact", data);
        console.log(`\u2705 Contact creado sin email: ${result.id}`);
      }
      if (result && result.id) {
        const refId = result.id;
        const refUrl = `https://${vars.salesforceInstanceUrl}/lightning/r/Contact/${result.id}/view`;
        try {
          const updatedDoc = await prolibuApi.update(objectName, eventData.doc._id, { refId, refUrl });
          Object.assign(eventData.doc, updatedDoc);
          console.log(`\u2705 Contact asociado con Salesforce: ${refId}`);
        } catch (error) {
          console.error(`Failed to update Prolibu Contact with Salesforce refId:`, error);
        }
      } else {
        console.error("\u274C No hay result v\xE1lido para actualizar Prolibu");
      }
    } catch (error) {
      console.error(`Failed to create Salesforce Contact:`, error);
      const isDuplicateError = error.message?.includes("duplicate") || error.message?.includes("ya existe") || error.message?.includes("DUPLICATE_VALUE") || error.message?.includes("creating a duplicate");
      if (isDuplicateError) {
        console.log("\u{1F50D} Error de duplicado detectado, buscando registro existente...");
        try {
          const data = await DataMapper.map({
            data: eventData.doc,
            map: config.map,
            transforms: config.transforms,
            afterTransforms: config.afterTransforms
          });
          console.log(`\u{1F50D} Buscando por email: ${data.Email}`);
          if (data.Email) {
            const existing = await salesforceApi.find("Contact", {
              where: `Email = '${data.Email.replace(/'/g, "\\'")}'`,
              limit: 1,
              select: "Id"
            });
            console.log(`\u{1F4CA} Resultado b\xFAsqueda fallback: ${existing.totalSize} contactos encontrados`);
            if (existing.totalSize > 0) {
              const refId = existing.records[0].Id;
              const refUrl = `https://${vars.salesforceInstanceUrl}/lightning/r/Contact/${refId}/view`;
              const updatedDoc = await prolibuApi.update(objectName, eventData.doc._id, { refId, refUrl });
              Object.assign(eventData.doc, updatedDoc);
              console.log(`\u{1F517} Asociado con contact existente: ${refId}`);
              return;
            } else {
              console.error("\u274C No se encontr\xF3 el contact duplicado en fallback");
            }
          } else {
            console.error("\u274C No hay email para buscar en fallback");
          }
        } catch (findError) {
          console.error("\u274C Error en b\xFAsqueda de fallback:", findError.message);
        }
      } else {
        console.error("\u274C Error no relacionado con duplicados:", error.message);
      }
    }
  }
  await salesforceApi.authenticate();
  async function afterCreate(objectName, config) {
    try {
      const data = await DataMapper.map({
        data: eventData.doc,
        map: config.map,
        transforms: config.transforms,
        afterTransforms: config.afterTransforms
      });
      const { mapToObject } = config;
      const result = await salesforceApi.create(mapToObject, data);
      const refId = result.id;
      const refUrl = `https://${vars.salesforceInstanceUrl}/lightning/r/${mapToObject}/${result.id}/view`;
      try {
        const updatedDoc = await prolibuApi.update(objectName, eventData.doc._id, { refId, refUrl });
        Object.assign(eventData.doc, updatedDoc);
      } catch (error) {
        console.error(`Failed to update Prolibu '${objectName}' with Salesforce refId:`, error);
      }
    } catch (error) {
      console.error(`Failed to create Salesforce '${config.mapToObject}':`, error);
    }
  }
  async function afterUpdate(objectName, config) {
    const refId = eventData?.beforeUpdateDoc?.refId;
    const { mapToObject } = config;
    if (refId) {
      try {
        const data = await DataMapper.map({
          data: eventData.payload,
          map: config.map,
          transforms: config.transforms,
          afterTransforms: config.afterTransforms
        });
        console.log(`\u{1F50D} Updating existing ${mapToObject} in Salesforce with ID: ${refId}`, data);
        await salesforceApi.update(mapToObject, refId, data);
      } catch (error) {
        console.error(`Failed to update Salesforce '${mapToObject}':`, error);
      }
    }
  }
  async function afterDelete(objectName, config) {
    const refId = eventData?.doc?.refId;
    const { mapToObject } = config;
    if (refId) {
      try {
        await salesforceApi.delete(mapToObject, refId);
      } catch (error) {
        console.error(`Failed to delete Salesforce '${mapToObject}':`, error.message);
      }
    }
  }
  async function toSalesforceUserId(prolibuUserId, avoidBlank = false) {
    if (!prolibuUserId) {
      return avoidBlank ? void 0 : prolibuUserId;
    }
    try {
      const prolibUser = await prolibuApi.findOne("User", prolibuUserId, { select: "email" });
      if (!prolibUser?.email) {
        return avoidBlank ? void 0 : null;
      }
      const salesforceUsers = await salesforceApi.find("User", {
        where: `Email = '${prolibUser.email}' AND IsActive = true`,
        limit: 1,
        select: "Id,Email,Name"
      });
      if (salesforceUsers.totalSize > 0) {
        return salesforceUsers.records[0].Id;
      } else {
        return avoidBlank ? void 0 : null;
      }
    } catch (error) {
      console.error(`Error mapping Prolibu user ${prolibuUserId} to Salesforce user:`, error);
      return avoidBlank ? void 0 : null;
    }
  }
  const objectsConfig = {
    Company: {
      active: true,
      mapToObject: "Account",
      map: {
        ...require_CompanyMap(),
        "customFields.tipoDeCuenta": "Tipo_de_Cuenta_cc__c",
        "customFields.razonSocial": "Name",
        "customFields.numeroIdentificacionTributaria": "N_mero_de_identificaci_n_tributaria__c",
        "customFields.tipoIdentificacionEmpresa": "Tipo_de_Identificaci_n_empresa__c",
        "customFields.tipoDeCliente": "Tipo_de_Cliente_cc__c",
        "customFields.estadoDeCliente": "Estado_cliente__c",
        "customFields.tipoDeEmpresa": "Tipo_de_Empresa__c",
        "customFields.segmentoCliente": "Segmento__c",
        "customFields.macroSector": "Macro_Sector__c",
        "customFields.necesitaCredito": "Necesita_credito__c"
      },
      events: {
        "Company.afterCreate": afterCreate,
        "Company.afterUpdate": afterUpdate,
        "Company.afterDelete": afterDelete
      },
      transforms: {
        OwnerId: toSalesforceUserId
      },
      afterTransforms: {
        Estado_cliente__c: function(value) {
          const estadoMapping = {
            "ACTIVO": "ACTIVO",
            "INACTIVO": "INACTIVO",
            "PENDIENTE": "ACTIVO",
            "SUSPENDIDO": "INACTIVO"
          };
          const mappedValue = estadoMapping[value] || "ACTIVO";
          return mappedValue;
        },
        Ruta__c: function() {
          return "Activa";
        }
      }
    },
    Contact: {
      active: true,
      mapToObject: "Contact",
      map: require_ContactMap(),
      events: {
        "Contact.afterCreate": afterCreateWithDuplicateHandling,
        "Contact.afterUpdate": afterUpdate,
        "Contact.afterDelete": afterDelete
      },
      transforms: {
        OwnerId: toSalesforceUserId,
        AccountId: async function(prolibuCompanyId) {
          if (!prolibuCompanyId && eventData.doc?.contact) {
            try {
              const contact = await prolibuApi.findOne("Contact", eventData.doc.contact, {
                select: "company"
              });
              if (contact?.company) {
                prolibuCompanyId = contact.company;
              }
            } catch (error) {
              console.warn("Error obteniendo company del contact:", error.message);
            }
          }
          if (!prolibuCompanyId) return null;
          try {
            const company = await prolibuApi.findOne("Company", prolibuCompanyId, {
              select: "refId"
            });
            if (company?.refId) {
              try {
                const sfAccount = await salesforceApi.findOne("Account", company.refId, {
                  select: "Id, Estado_cliente__c, Name"
                });
                if (sfAccount) {
                  if (sfAccount.Estado_cliente__c !== "ACTIVO") {
                    await salesforceApi.update("Account", company.refId, {
                      Estado_cliente__c: "ACTIVO"
                    });
                    await salesforceApi.findOne("Account", company.refId, {
                      select: "Estado_cliente__c"
                    });
                  }
                } else {
                  console.error("\u274C No se encontr\xF3 el Account en Salesforce");
                }
              } catch (accountError) {
                console.error("\u274C Error verificando/activando Account:", accountError.message);
              }
              return company.refId;
            }
            return null;
          } catch (error) {
            console.warn("Error mapeando company:", error.message);
            return null;
          }
        }
      }
    },
    Deal: {
      active: true,
      mapToObject: "Opportunity",
      map: {
        ...require_DealMap(),
        "customFields.tipoEvento": "Tipo_de_Servicio__c",
        "customFields.numeroDePersonas": "N_mero_de_Asistentes__c",
        "customFields.numeroDeHabitaciones": "N_mero_de_Habitaciones__c",
        // Fechas del evento
        "customFields.fechaHoraIngreso": "Fecha_Check_In__c",
        "customFields.fechaHoraSalida": "Fecha_Check_Out__c",
        // Ubicación
        "customFields.ciudadDeInteres": "Ciudad_de_Inter_s__c",
        "customFields.hotelPreferido": "Hotel__c",
        // Información del servicio
        "customFields.detalleDelRequerimiento": "Description"
      },
      events: {
        "Deal.afterCreate": afterCreate,
        "Deal.afterUpdate": afterUpdate,
        "Deal.afterDelete": afterDelete
      },
      transforms: {
        OwnerId: toSalesforceUserId,
        ContactId: async function(prolibuContactId) {
          if (!prolibuContactId) return null;
          try {
            const contact = await prolibuApi.findOne("Contact", prolibuContactId, {
              select: "email refId",
              populate: "*"
            });
            if (contact?.refId) {
              return contact.refId;
            }
            if (contact?.email) {
              const sfContacts = await salesforceApi.find("Contact", {
                where: `Email = '${contact.email.replace(/'/g, "\\'")}'`,
                limit: 1,
                select: "Id"
              });
              return sfContacts.totalSize > 0 ? sfContacts.records[0].Id : null;
            }
            return null;
          } catch (error) {
            console.warn("Error mapeando contact:", error.message);
            return null;
          }
        },
        AccountId: async function(prolibuCompanyId) {
          if (!prolibuCompanyId && eventData.doc?.contact) {
            try {
              const contact = await prolibuApi.findOne("Contact", eventData.doc.contact, {
                select: "company"
              });
              if (contact?.company) {
                prolibuCompanyId = contact.company;
              }
            } catch (error) {
              console.warn("Error obteniendo company del contact para Deal:", error.message);
            }
          }
          if (!prolibuCompanyId) return null;
          try {
            const company = await prolibuApi.findOne("Company", prolibuCompanyId, {
              select: "refId"
            });
            if (company?.refId) {
              try {
                const sfAccount = await salesforceApi.findOne("Account", company.refId, {
                  select: "Id, Estado_cliente__c, Ruta__c, Name, CreatedDate"
                });
                if (sfAccount) {
                  const needsUpdate = {
                    ...sfAccount.Estado_cliente__c !== "ACTIVO" && { Estado_cliente__c: "ACTIVO" },
                    ...sfAccount.Ruta__c !== "Activa" && { Ruta__c: "Activa" }
                  };
                  if (Object.keys(needsUpdate).length > 0) {
                    await salesforceApi.update("Account", company.refId, needsUpdate);
                    await salesforceApi.findOne("Account", company.refId, {
                      select: "Estado_cliente__c, Ruta__c"
                    });
                  }
                } else {
                  console.error("\u274C [DEAL] No se encontr\xF3 el Account en Salesforce");
                }
              } catch (accountError) {
                console.error("\u274C [DEAL] Error verificando/activando Account:", accountError.message);
              }
              return company.refId;
            }
            return null;
          } catch (error) {
            console.warn("Error mapeando company para Deal:", error.message);
            return null;
          }
        }
      },
      afterTransforms: {
        StageName: function() {
          return "Captura de Necesidades";
        },
        CloseDate: function(value) {
          if (value) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split("T")[0];
            }
          }
          const in30Days = /* @__PURE__ */ new Date();
          in30Days.setDate(in30Days.getDate() + 30);
          return in30Days.toISOString().split("T")[0];
        },
        Ciudad_de_Inter_s__c: function(value) {
          return eventData.doc?.customFields?.ciudadDeInteres || value || "Bogot\xE1";
        },
        Hotel__c: function(value) {
          return eventData.doc?.customFields?.hotelPreferido || value || "Hotel Distrito";
        }
      }
    }
  };
  const outboundIntegration = new OutboundIntegration(objectsConfig);
  await outboundIntegration.initialize();
})();

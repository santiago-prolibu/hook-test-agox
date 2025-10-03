/**
 * Prolibu / Salesforce Outbound Integration
 * Migrated to new structure
 */

/* global eventName, variables, eventData, env, localDomain */

const OutboundIntegration = require("../../../lib/vendors/prolibu/OutboundIntegration");
const DataMapper = require("../../../lib/vendors/prolibu/DataMapper");
const SalesforceApi = require("../../../lib/vendors/salesforce/SalesforceApi");
const ProlibuApi = require("../../../lib/vendors/prolibu/ProlibuApi");
const { getRequiredVars } = require("../../../lib/utils/variables");

const vars = getRequiredVars({
  salesforceInstanceUrl: `salesforce-instanceUrl-${env}`,
  salesforceCustomerKey: `salesforce-customerKey-${env}`,
  salesforceCustomerSecret: `salesforce-customerSecret-${env}`,
  prolibuApiKey: `prolibu-apiKey-${env}`,
});

const prolibuApi = new ProlibuApi({ apiKey: vars.prolibuApiKey });
const outboundApi = new SalesforceApi({
  instanceUrl: vars.salesforceInstanceUrl,
  customerKey: vars.salesforceCustomerKey,
  customerSecret: vars.salesforceCustomerSecret,
});

// ============================================================================
// HANDLERS
// ============================================================================
const Handlers = {
  async afterCreate(objectName, config, event, customData = null) {
    try {
      const data = customData || eventData.doc;

      const mappedData = await DataMapper.mapWithConfig({
        data,
        config,
        event,
      });

      const doc = await outboundApi.create(config.target, mappedData);

      try {
        const refData = outboundApi.getRefData(config.target, doc.id);

        const updatedDoc = await prolibuApi.update(
          objectName,
          data._id,
          refData
        );

        if (!customData) {
          Object.assign(eventData.doc, updatedDoc);
        }

        return mappedData;
      } catch (error) {
        console.error(
          `❌ [DEBUG-HANDLER] Failed to update Prolibu '${objectName}' with Salesforce refId:`,
          error
        );
        console.error(`❌ [DEBUG-HANDLER] Stack:`, error.stack);
      }
    } catch (error) {
      console.error(
        `❌ [DEBUG-HANDLER] Failed to create Salesforce '${config.target}':`,
        error.message
      );
      console.error(`❌ [DEBUG-HANDLER] Stack:`, error.stack);
    }
  },

  // 🆕 Custom handler for Contact with duplicate handling
  async afterCreateContactWithDuplicateHandling(
    objectName,
    config,
    event,
    customData = null
  ) {
    try {
      const data = customData || eventData.doc;

      const mappedData = await DataMapper.mapWithConfig({
        data,
        config,
        event,
      });

      if (!mappedData.AccountId && data.company) {
        console.warn(
          "⚠️ [DEBUG-CONTACT] ADVERTENCIA: Contact tiene company pero AccountId es undefined!"
        );
        console.warn(
          "⚠️ [DEBUG-CONTACT] Esto significa que el transform NO se ejecutó"
        );
        console.warn("⚠️ [DEBUG-CONTACT] data.company:", data.company);
      }

      let result;

      // 🎯 Estrategia directa: Buscar primero por email
      if (mappedData.Email) {
        try {
          const existingContacts = await outboundApi.find("Contact", {
            where: { Email: mappedData.Email },
            limit: 1,
            select: "Id",
          });

          if (existingContacts.totalSize > 0) {
            // Usar contact existente
            result = { id: existingContacts.records[0].Id };

            try {
              await outboundApi.update("Contact", result.id, mappedData);
            } catch (updateError) {
              console.warn("Error actualizando contact:", updateError.message);
            }
          } else {
            // Crear nuevo

            try {
              result = await outboundApi.create("Contact", mappedData);
            } catch (createError) {
              console.error(`❌ Error creando:`, createError.message);

              // Race condition handling
              if (createError.message?.includes("duplicate")) {
                const retrySearch = await outboundApi.find("Contact", {
                  where: { Email: mappedData.Email },
                  limit: 1,
                  select: "Id",
                });

                if (retrySearch.totalSize > 0) {
                  result = { id: retrySearch.records[0].Id };
                } else {
                  throw createError;
                }
              } else {
                throw createError;
              }
            }
          }
        } catch (searchError) {
          console.error("❌ Error en búsqueda:", searchError.message);
          throw searchError;
        }
      } else {
        // Sin email, crear directamente
        result = await outboundApi.create("Contact", mappedData);
      }

      // Actualizar Prolibu con refId
      if (result && result.id) {
        const refData = outboundApi.getRefData("Contact", result.id);
        const updatedDoc = await prolibuApi.update(
          objectName,
          data._id,
          refData
        );

        if (!customData) {
          Object.assign(eventData.doc, updatedDoc);
        }
      }

      return mappedData;
    } catch (error) {
      console.error(`Failed to create Salesforce Contact:`, error);

      // Fallback para duplicados no manejados
      const isDuplicateError =
        error.message?.includes("duplicate") ||
        error.message?.includes("ya existe") ||
        error.message?.includes("DUPLICATE_VALUE");

      if (isDuplicateError) {
        try {
          const data = customData || eventData.doc;
          const mappedData = await DataMapper.mapWithConfig({
            data,
            config,
            event,
          });

          if (mappedData.Email) {
            const existing = await outboundApi.find("Contact", {
              where: { Email: mappedData.Email },
              limit: 1,
              select: "Id",
            });

            if (existing.totalSize > 0) {
              const refData = outboundApi.getRefData(
                "Contact",
                existing.records[0].Id
              );
              const updatedDoc = await prolibuApi.update(
                objectName,
                data._id,
                refData
              );

              if (!customData) {
                Object.assign(eventData.doc, updatedDoc);
              }

              return;
            }
          }
        } catch (findError) {
          console.error("❌ Error en búsqueda de fallback:", findError.message);
        }
      }
    }
  },

  async afterUpdate(objectName, config, event) {
    const refId = eventData?.beforeUpdateDoc?.refId;

    if (refId) {
      try {
        const mappedData = await DataMapper.mapWithConfig({
          data: eventData.payload,
          config,
          event,
        });

        await outboundApi.update(config.target, refId, mappedData);
      } catch (error) {
        console.error(`Failed to update Salesforce '${config.target}':`, error);
      }
    }
  },

  async afterDelete(objectName, config) {
    const refId = eventData?.doc?.refId;

    if (refId) {
      try {
        await outboundApi.delete(config.target, refId);
      } catch (error) {
        console.error(
          `❌ Failed to delete Salesforce '${config.target}':`,
          error.message
        );
      }
    }
  },
};

// ============================================================================
// TRANSFORMS
// ============================================================================
const Transforms = {
  async getSalesforceUserId(prolibuUserId, avoidBlank = false) {
    if (!prolibuUserId) {
      return avoidBlank ? undefined : prolibuUserId;
    }

    try {
      const prolibuUser = await prolibuApi.findOne("User", prolibuUserId, {
        select: "email",
      });
      if (!prolibuUser?.email) {
        return avoidBlank ? undefined : null;
      }

      const salesforceUsers = await outboundApi.find("User", {
        where: { Email: prolibuUser.email, IsActive: true },
        limit: 1,
        select: "Id Email Name",
      });

      if (salesforceUsers.totalSize > 0) {
        return salesforceUsers.records[0].Id;
      } else {
        return avoidBlank ? undefined : null;
      }
    } catch (error) {
      console.error(
        `Error mapping Prolibu user ${prolibuUserId} to Salesforce user:`,
        error
      );
      return avoidBlank ? undefined : null;
    }
  },

  async getSalesforceContactId(prolibuContactId, avoidBlank = false) {
    if (!prolibuContactId) {
      return avoidBlank ? undefined : prolibuContactId;
    }

    try {
      let prolibuContact = await prolibuApi.findOne(
        "Contact",
        prolibuContactId,
        {
          select: "email refId",
          populate: "*",
        }
      );

      // Si ya tiene refId, usarlo
      if (prolibuContact?.refId) {
        return prolibuContact.refId;
      }

      // Buscar por email
      if (prolibuContact?.email) {
        const salesforceContacts = await outboundApi.find("Contact", {
          where: { Email: prolibuContact.email },
          limit: 1,
          select: "Id",
        });

        if (salesforceContacts.totalSize > 0) {
          return salesforceContacts.records[0].Id;
        }
      }

      return avoidBlank ? undefined : null;
    } catch (error) {
      console.warn("Error mapeando contact:", error.message);
      return avoidBlank ? undefined : null;
    }
  },

  // 🆕 Transform para AccountId CON creación automática si no existe
  async getSalesforceAccountIdAndActivate(
    prolibuCompanyId,
    avoidBlank = false
  ) {
    if (!prolibuCompanyId) {
      return avoidBlank ? undefined : prolibuCompanyId;
    }

    try {
      const company = await prolibuApi.findOne("Company", prolibuCompanyId, {
        select: "refId customFields",
      });

      //  SI YA TIENE REFID, verificar y activar
      if (company?.refId) {
        try {
          const sfAccount = await outboundApi.findOne(
            "Account",
            company.refId,
            {
              select: "Id Estado_cliente__c Ruta__c Name",
            }
          );

          if (sfAccount) {
            // Verificar si necesita actualización
            const needsUpdate = {
              ...(sfAccount.Estado_cliente__c !== "ACTIVO" && {
                Estado_cliente__c: "ACTIVO",
              }),
              ...(sfAccount.Ruta__c !== "Activa" && { Ruta__c: "Activa" }),
            };

            if (Object.keys(needsUpdate).length > 0) {
              await outboundApi.update("Account", company.refId, needsUpdate);
            }

            return company.refId;
          } else {
            console.warn(
              `⚠️ [ACCOUNT] refId existe pero Account no encontrado en Salesforce, recreando...`
            );
          }
        } catch (accountError) {
          console.error(
            "❌ [ACCOUNT] Error verificando Account:",
            accountError.message
          );
        }
      }

      // 🆕 SI NO TIENE REFID, CREAR EL ACCOUNT PRIMERO
      const companyConfig = integrationConfig.find(
        (config) => config.source === "Company"
      );
      if (!companyConfig) {
        console.error("❌ [ACCOUNT] No se encontró configuración de Company");
        return avoidBlank ? undefined : null;
      }

      // Obtener el evento afterCreate
      const createEvent = companyConfig.events.find(
        (event) => event.name === "afterCreate"
      );
      if (!createEvent) {
        console.error(
          "❌ [ACCOUNT] No se encontró evento afterCreate para Company"
        );
        return avoidBlank ? undefined : null;
      }

      // Crear el Account usando el handler
      try {
        const fullCompany = await prolibuApi.findOne(
          "Company",
          prolibuCompanyId
        );

        await Handlers.afterCreate(
          "Company",
          companyConfig,
          createEvent,
          fullCompany
        );

        const updatedCompany = await prolibuApi.findOne(
          "Company",
          prolibuCompanyId,
          {
            select: "refId",
          }
        );

        if (updatedCompany?.refId) {
          return updatedCompany.refId;
        } else {
          console.error(
            "❌ [ACCOUNT] Account creado pero refId no actualizado"
          );

          return avoidBlank ? undefined : null;
        }
      } catch (createError) {
        console.error(
          "❌ [ACCOUNT] Error creando Account:",
          createError.message
        );
        console.error("❌ [DEBUG-ACCOUNT] Stack trace:", createError.stack);

        return avoidBlank ? undefined : null;
      }
    } catch (error) {
      console.error("❌ [ACCOUNT] Error general:", error.message);
      console.error("❌ [DEBUG-ACCOUNT] Stack trace:", error.stack);

      return avoidBlank ? undefined : null;
    }
  },

  mapEstadoCliente(value) {
    const estadoMapping = {
      ACTIVO: "ACTIVO",
      INACTIVO: "INACTIVO",
      PENDIENTE: "ACTIVO",
      SUSPENDIDO: "INACTIVO",
    };

    return estadoMapping[value] || "ACTIVO";
  },

  // 🆕 Mapeo de monedas - Salesforce solo acepta USD o COP
  mapCurrency(value) {
    if (value === undefined || value === null) {
      return undefined; // No incluir el campo en el payload
    }

    // Monedas válidas en Salesforce
    const validCurrencies = ["USD", "COP"];

    // Si es una moneda válida, usarla
    if (validCurrencies.includes(value)) {
      return value;
    }

    console.warn(
      `⚠️ [CURRENCY] Moneda no válida: "${value}", usando COP por defecto`
    );
    return "COP";
  },

  // Mapeo de Macro Sector - Solo valores diferentes entre Prolibu y Salesforce
  mapMacroSector(value) {
    if (!value) return value;

    // Solo mapear valores que son DIFERENTES
    const macroSectorMap = {
      "AGENCIA DE VIAJES TMC": "AGENCIAS DE VIAJES TMC",
      "AGENCIA DE VIAJES VACACIONAL DMC": "AGENCIAS DE VIAJES DMC",
      "AGENCIA DE VIAJES VACACIONAL MAYORISTA": "AGENCIA DE VIAJES",
      "AGENCIA DE VIAJES INTERNACIONAL": "AGENCIAS DE VIAJES INTERNACIONAL",
      "ASOCIACIONES Y AGREMICIONES": "ASOCIACIONES Y AGREMIACIONES",
      EDUCACIÓN: "EDUACIÓN",
      "INDUSTRIA ENERGETICA": "INDUSTRIA ENERGÉTICA",
      "TRANSPORTE AÉREO": "TRANSPORTE AEREO",
      "TRANSPORTE Y LOGÍSTICA": "TRANSPORTE Y LOGISTICA",
    };

    const upperValue = value.toUpperCase().trim();
    const mappedValue = macroSectorMap[upperValue];

    if (mappedValue) {
      return mappedValue;
    }

    // Si no está en el mapa, pasar tal cual
    return value;
  },

  // 🆕 Mapeo de Tipo de Evento/Servicio - Prolibu → Salesforce
  mapTipoServicio(value) {
    if (!value) return value;

    const tipoServicioMap = {
      "Evento": "Eventos", // Singular → Plural
      "Hospedaje + Evento": "Hospedaje - Eventos", // + → - y plural
      "Evento Interno": "Eventos", // Mapear a Eventos genérico (o ajustar según necesidad)
    };

    // Buscar mapeo exacto (case-sensitive para preservar formato)
    const mappedValue = tipoServicioMap[value];

    if (mappedValue) {
      return mappedValue;
    }

    // Si no está en el mapa, pasar tal cual (ej: "Hospedaje" se mantiene igual)
    return value;
  },

  // Default values para Deal
  defaultStageName() {
    return "Captura de Necesidades";
  },

  defaultCloseDate(value) {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    }

    // Default: 30 días desde ahora
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    return in30Days.toISOString().split("T")[0];
  },

  defaultCiudad(value) {
    // Si el valor existe y no es undefined/null/empty, usarlo
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
    // Solo aplicar default si es undefined, null o vacío
    return "Bogotá";
  },

  defaultHotel(value, mappedData) {
    // Si el valor existe y no es undefined/null/empty, usarlo
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }

    // Mapeo de hoteles válidos por ciudad según Salesforce picklist dependencies
    // Basado en el campo "validFor" del schema de Salesforce
    const hotelsPorCiudad = {
      'Bogotá': 'Hotel Distrito',        // validFor: gAAA (Bogotá)
      'Cartagena': 'Hotel Karmairi',     // validFor: QAAA (Cartagena)
      'Palomino': 'Hotel Naio',          // validFor: IAAA (Palomino)
      'Guajira': 'Hotel Waya',           // validFor: EAAA (Guajira)
      'Santa Marta': 'Hotel Ac Santa Marta', // validFor: CAAA (Santa Marta)
      'Barranquilla': 'Hotel Hiex Barranquilla', // validFor: BAAA (Barranquilla)
      'Bucaramanga': 'Hotel Bari',       // validFor: AgAA (Bucaramanga)
      'Medellín': 'Hotel Fairfield Sabaneta', // validFor: AQAA (Medellín)
      'Quibdó': 'Hotel Mia',             // validFor: AIAA (Quibdó)
      'Yopal': 'Hotel Hiex Yopal',       // validFor: AEAA (Yopal)
      'San Andrés': 'Hotel Grand Sirenis', // validFor: ACAA (San Andrés)
      'Pereira': 'Hotel Mia',            // Usar un hotel genérico (ajustar según disponibilidad)
    };

    // Obtener la ciudad del mappedData
    const ciudad = mappedData?.Ciudad_de_Inter_s__c;

    // Devolver hotel según la ciudad, o default a Bogotá
    return hotelsPorCiudad[ciudad] || hotelsPorCiudad['Bogotá'];
  },
};

// ============================================================================
// DEFAULT EVENTS
// ============================================================================
const defaultEvents = [
  { name: "afterCreate", handler: Handlers.afterCreate },
  { name: "afterUpdate", handler: Handlers.afterUpdate },
  { name: "afterDelete", handler: Handlers.afterDelete },
];

// ============================================================================
// INTEGRATION CONFIG
// ============================================================================
const integrationConfig = [
  // ============================================================================
  // COMPANY -> ACCOUNT
  // ============================================================================
  {
    source: "Company",
    target: "Account",
    active: true,
    map: {
      ...require("../../../lib/vendors/salesforce/maps/CompanyMap"),
      "customFields.tipoDeCuenta": "Tipo_de_Cuenta_cc__c",
      "customFields.razonSocial": "Name",
      "customFields.numeroIdentificacionTributaria":
        "N_mero_de_identificaci_n_tributaria__c",
      "customFields.tipoIdentificacionEmpresa":
        "Tipo_de_Identificaci_n_empresa__c",
      "customFields.tipoDeCliente": "Tipo_de_Cliente_cc__c",
      "customFields.estadoDeCliente": "Estado_cliente__c",
      "customFields.tipoDeEmpresa": "Tipo_de_Empresa__c",
      "customFields.segmentoCliente": "Segmento__c",
      "customFields.macroSector": "Macro_Sector__c",
      "customFields.necesitaCredito": "Necesita_credito__c",
    },
    events: defaultEvents,
    globalTransforms: {
      OwnerId: Transforms.getSalesforceUserId,
    },
    globalAfterTransforms: {
      Estado_cliente__c: Transforms.mapEstadoCliente,
      Ruta__c: () => "Activa",
      CurrencyIsoCode: Transforms.mapCurrency,
      Macro_Sector__c: Transforms.mapMacroSector,
    },
  },

  // ============================================================================
  // CONTACT -> CONTACT
  // ============================================================================
  {
    source: "Contact",
    target: "Contact",
    active: true,
    map: {
      ...require("../../../lib/vendors/salesforce/maps/ContactMap"),
      company: "AccountId",
    },
    events: [
      {
        name: "afterCreate",
        handler: Handlers.afterCreateContactWithDuplicateHandling,
      },
      { name: "afterUpdate", handler: Handlers.afterUpdate },
      { name: "afterDelete", handler: Handlers.afterDelete },
    ],
    globalTransforms: {
      OwnerId: Transforms.getSalesforceUserId,
      AccountId: Transforms.getSalesforceAccountIdAndActivate,
    },
  },

  // ============================================================================
  // DEAL -> OPPORTUNITY
  // ============================================================================
  {
    source: "Deal",
    target: "Opportunity",
    active: true,
    map: {
      ...require("../../../lib/vendors/salesforce/maps/DealMap"),
      "customFields.tipoEvento": "Tipo_de_Servicio__c",
      "customFields.numeroDePersonas": "N_mero_de_Asistentes__c",
      "customFields.numeroDeHabitaciones": "N_mero_de_Habitaciones__c",
      "customFields.fechaHoraIngreso": "Fecha_Check_In__c",
      "customFields.fechaHoraSalida": "Fecha_Check_Out__c",
      "customFields.ciudadDeInteres": "Ciudad_de_Inter_s__c",
      "customFields.hotelPreferido": "Hotel__c",
      "customFields.detalleDelRequerimiento": "Description",
    },
    events: defaultEvents,
    globalTransforms: {
      OwnerId: Transforms.getSalesforceUserId,
      ContactId: Transforms.getSalesforceContactId,
      AccountId: Transforms.getSalesforceAccountIdAndActivate, // Con activación automática
    },
    globalAfterTransforms: {
      StageName: Transforms.defaultStageName,
      CloseDate: Transforms.defaultCloseDate,
      Tipo_de_Servicio__c: Transforms.mapTipoServicio, // 🆕 Mapear tipo de servicio
      Ciudad_de_Inter_s__c: Transforms.defaultCiudad,
      Hotel__c: Transforms.defaultHotel,
    },
  },
];

// ============================================================================
// MAIN
// ============================================================================
(async function main() {
  await outboundApi.authenticate();
  const integration = new OutboundIntegration(integrationConfig);
  await integration.initialize();
})();

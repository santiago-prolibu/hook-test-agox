
/**
 * Prolibu / Salesforce Outbound Integration
 * Basic Example
 */

/* global eventName, variables, eventData, env */

const OutboundIntegration = require('../../../lib/vendors/prolibu/OutboundIntegration');
const DataMapper = require('../../../lib/vendors/prolibu/DataMapper');
const SalesforceApi = require('../../../lib/vendors/salesforce/SalesforceApi');
const ProlibuApi = require('../../../lib/vendors/prolibu/ProlibuApi');
const { getRequiredVars } = require('../../../lib/utils/variables');

// Ensure required variables are set
const vars = getRequiredVars({
  salesforceInstanceUrl: `salesforce-instanceUrl-${env}`,
  salesforceCustomerKey: `salesforce-customerKey-${env}`,
  salesforceCustomerSecret: `salesforce-customerSecret-${env}`,
  prolibuApiKey: `prolibu-apiKey-${env}`,
});


(async function () {

  const prolibuApi = new ProlibuApi({ apiKey: vars.prolibuApiKey });
  const salesforceApi = new SalesforceApi({
    instanceUrl: vars.salesforceInstanceUrl,
    customerKey: vars.salesforceCustomerKey,
    customerSecret: vars.salesforceCustomerSecret,
  });

  async function afterCreateWithDuplicateHandling(objectName, config) {
    try {
      const data = await DataMapper.map({
        data: eventData.doc,
        map: config.map,
        transforms: config.transforms,
        afterTransforms: config.afterTransforms,
      });

      console.log('%c🟢 [AGOX] data Mapeada', 'color: green; font-weight: bold;', data);

      let result;

      // 🎯 Estrategia directa: Buscar primero por email, luego crear o usar existente
      if (data.Email) {
        console.log(`🔍 Buscando contact existente por email: ${data.Email}`);

        try {
          const existingContacts = await salesforceApi.find('Contact', {
            where: `Email = '${data.Email.replace(/'/g, "\\'")}'`,
            limit: 1,
            select: 'Id'
          });

          console.log(`📊 Encontrados: ${existingContacts.totalSize} contactos existentes`);

          if (existingContacts.totalSize > 0) {
            // Usar contact existente
            result = { id: existingContacts.records[0].Id };
            console.log(`📧 Usando contact existente: ${result.id}`);

            // Actualizar con los nuevos datos
            try {
              await salesforceApi.update('Contact', result.id, data);
              console.log(`🔄 Contact actualizado: ${result.id}`);
            } catch (updateError) {
              console.warn('Error actualizando contact:', updateError.message);
            }
          } else {
            // No existe, intentar crear
            console.log(`✨ Email único, creando nuevo contact...`);
            try {
              result = await salesforceApi.create('Contact', data);
              console.log(`✅ Contact creado: ${result.id}`);
            } catch (createError) {
              console.error(`❌ Error creando:`, createError.message);

              // Si falla por duplicado (race condition), buscar de nuevo
              if (createError.message?.includes('duplicate')) {
                console.log('🔄 Race condition detectada, buscando de nuevo...');

                const retrySearch = await salesforceApi.find('Contact', {
                  where: `Email = '${data.Email.replace(/'/g, "\\'")}'`,
                  limit: 1,
                  select: 'Id'
                });

                if (retrySearch.totalSize > 0) {
                  result = { id: retrySearch.records[0].Id };
                  console.log(`� Contact encontrado en retry: ${result.id}`);
                } else {
                  throw createError; // Re-lanzar si no encontramos nada
                }
              } else {
                throw createError; // Re-lanzar para otros errores
              }
            }
          }
        } catch (searchError) {
          console.error('❌ Error en búsqueda:', searchError.message);
          throw searchError;
        }
      } else {
        // Sin email, crear directamente
        console.log('⚠️ Sin email, creando directamente...');
        result = await salesforceApi.create('Contact', data);
        console.log(`✅ Contact creado sin email: ${result.id}`);
      }

      // ✅ Solo actualizar Prolibu si tenemos un result válido
      if (result && result.id) {
        const refId = result.id;
        const refUrl = `https://${vars.salesforceInstanceUrl}/lightning/r/Contact/${result.id}/view`;

        try {
          const updatedDoc = await prolibuApi.update(objectName, eventData.doc._id, { refId, refUrl });
          Object.assign(eventData.doc, updatedDoc);
          console.log(`✅ Contact asociado con Salesforce: ${refId}`);
        } catch (error) {
          console.error(`Failed to update Prolibu Contact with Salesforce refId:`, error);
        }
      } else {
        console.error('❌ No hay result válido para actualizar Prolibu');
      }
    } catch (error) {
      console.error(`Failed to create Salesforce Contact:`, error);

      // Fallback mejorado para casos no manejados
      const isDuplicateError = error.message?.includes('duplicate') ||
        error.message?.includes('ya existe') ||
        error.message?.includes('DUPLICATE_VALUE') ||
        error.message?.includes('creating a duplicate');

      if (isDuplicateError) {
        console.log('🔍 Error de duplicado detectado, buscando registro existente...');

        try {
          // Re-mapear los datos para asegurar consistencia
          const data = await DataMapper.map({
            data: eventData.doc,
            map: config.map,
            transforms: config.transforms,
            afterTransforms: config.afterTransforms,
          });

          console.log(`🔍 Buscando por email: ${data.Email}`);

          if (data.Email) {
            const existing = await salesforceApi.find('Contact', {
              where: `Email = '${data.Email.replace(/'/g, "\\'")}'`,
              limit: 1,
              select: 'Id'
            });

            console.log(`📊 Resultado búsqueda fallback: ${existing.totalSize} contactos encontrados`);

            if (existing.totalSize > 0) {
              const refId = existing.records[0].Id;
              const refUrl = `https://${vars.salesforceInstanceUrl}/lightning/r/Contact/${refId}/view`;

              const updatedDoc = await prolibuApi.update(objectName, eventData.doc._id, { refId, refUrl });
              Object.assign(eventData.doc, updatedDoc);

              console.log(`🔗 Asociado con contact existente: ${refId}`);
              return; // ✅ Salir exitosamente
            } else {
              console.error('❌ No se encontró el contact duplicado en fallback');
            }
          } else {
            console.error('❌ No hay email para buscar en fallback');
          }
        } catch (findError) {
          console.error('❌ Error en búsqueda de fallback:', findError.message);
        }
      } else {
        console.error('❌ Error no relacionado con duplicados:', error.message);
      }
    }
  }

  await salesforceApi.authenticate();

  // EVENT HANDLERS
  async function afterCreate(objectName, config) {

    try {
      const data = await DataMapper.map({
        data: eventData.doc,
        map: config.map,
        transforms: config.transforms,
        afterTransforms: config.afterTransforms,
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
          afterTransforms: config.afterTransforms,
        });

        console.log(`🔍 Updating existing ${mapToObject} in Salesforce with ID: ${refId}`, data);
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

  // HELPER FUNCTIONS
  async function toSalesforceUserId(prolibuUserId, avoidBlank = false) {
    if (!prolibuUserId) {
      return avoidBlank ? undefined : prolibuUserId;
    }

    try {
      const prolibUser = await prolibuApi.findOne('User', prolibuUserId, { select: 'email' });
      if (!prolibUser?.email) {
        return avoidBlank ? undefined : null;
      }

      const salesforceUsers = await salesforceApi.find('User', {
        where: `Email = '${prolibUser.email}' AND IsActive = true`,
        limit: 1,
        select: 'Id,Email,Name',
      });

      if (salesforceUsers.totalSize > 0) {
        return salesforceUsers.records[0].Id;
      } else {
        return avoidBlank ? undefined : null;
      }

    } catch (error) {
      console.error(`Error mapping Prolibu user ${prolibuUserId} to Salesforce user:`, error);
      return avoidBlank ? undefined : null;
    }
  }

  const objectsConfig = {
    Company: {
      active: true,
      mapToObject: 'Account',

      map: {
        ...require('../../../lib/vendors/salesforce/maps/CompanyMap'),
        'customFields.tipoDeCuenta': 'Tipo_de_Cuenta_cc__c',
        'customFields.razonSocial': 'Name',
        'customFields.numeroIdentificacionTributaria': 'N_mero_de_identificaci_n_tributaria__c',
        'customFields.tipoIdentificacionEmpresa': 'Tipo_de_Identificaci_n_empresa__c',
        'customFields.tipoDeCliente': 'Tipo_de_Cliente_cc__c',
        'customFields.estadoDeCliente': 'Estado_cliente__c',
        'customFields.tipoDeEmpresa': 'Tipo_de_Empresa__c',
        'customFields.segmentoCliente': 'Segmento__c',
        'customFields.macroSector': 'Macro_Sector__c',
        'customFields.necesitaCredito': 'Necesita_credito__c',
      },
      events: {
        'Company.afterCreate': afterCreate,
        'Company.afterUpdate': afterUpdate,
        'Company.afterDelete': afterDelete,
      },
      transforms: {
        OwnerId: toSalesforceUserId,
      },
      afterTransforms: {
        Estado_cliente__c: function (value) {
          const estadoMapping = {
            'ACTIVO': 'ACTIVO',
            'INACTIVO': 'INACTIVO',
            'PENDIENTE': 'ACTIVO',
            'SUSPENDIDO': 'INACTIVO'
          };

          const mappedValue = estadoMapping[value] || 'ACTIVO';

          return mappedValue;
        },

        Ruta__c: function () {
          // 🆕 ESTE ES EL CAMPO QUE FALTABA - Ruta debe estar "Activa" para crear Opportunities
          return 'Activa';
        }
      }
    },
    Contact: {
      active: true,
      mapToObject: 'Contact',
      map: require('../../../lib/vendors/salesforce/maps/ContactMap'),
      events: {
        'Contact.afterCreate': afterCreateWithDuplicateHandling,
        'Contact.afterUpdate': afterUpdate,
        'Contact.afterDelete': afterDelete,
      },
      transforms: {
        OwnerId: toSalesforceUserId,
        AccountId: async function (prolibuCompanyId) {

          if (!prolibuCompanyId && eventData.doc?.contact) {
            try {
              const contact = await prolibuApi.findOne('Contact', eventData.doc.contact, {
                select: 'company'
              });

              if (contact?.company) {
                prolibuCompanyId = contact.company;
              }
            } catch (error) {
              console.warn('Error obteniendo company del contact:', error.message);
            }
          }

          if (!prolibuCompanyId) return null;

          try {
            const company = await prolibuApi.findOne('Company', prolibuCompanyId, {
              select: 'refId'
            });

            if (company?.refId) {
              try {
                const sfAccount = await salesforceApi.findOne('Account', company.refId, {
                  select: 'Id, Estado_cliente__c, Name'
                });

                if (sfAccount) {

                  // 🆕 Forzar estado ACTIVO si no está correcto
                  if (sfAccount.Estado_cliente__c !== 'ACTIVO') {


                    await salesforceApi.update('Account', company.refId, {
                      Estado_cliente__c: 'ACTIVO'
                    });


                    // Verificar que se actualizó
                    await salesforceApi.findOne('Account', company.refId, {
                      select: 'Estado_cliente__c'
                    });

                  }
                } else {
                  console.error('❌ No se encontró el Account en Salesforce');
                }

              } catch (accountError) {
                console.error('❌ Error verificando/activando Account:', accountError.message);
              }

              return company.refId;
            }

            return null;
          } catch (error) {
            console.warn('Error mapeando company:', error.message);
            return null;
          }
        }
      },
    },
    Deal: {
      active: true,
      mapToObject: 'Opportunity',
      map: {
        ...require('../../../lib/vendors/salesforce/maps/DealMap'),
        'customFields.tipoEvento': 'Tipo_de_Servicio__c',
        'customFields.numeroDePersonas': 'N_mero_de_Asistentes__c',
        'customFields.numeroDeHabitaciones': 'N_mero_de_Habitaciones__c',

        // Fechas del evento
        'customFields.fechaHoraIngreso': 'Fecha_Check_In__c',
        'customFields.fechaHoraSalida': 'Fecha_Check_Out__c',

        // Ubicación
        'customFields.ciudadDeInteres': 'Ciudad_de_Inter_s__c',
        'customFields.hotelPreferido': 'Hotel__c',

        // Información del servicio
        'customFields.detalleDelRequerimiento': 'Description',
      },
      events: {
        'Deal.afterCreate': afterCreate,
        'Deal.afterUpdate': afterUpdate,
        'Deal.afterDelete': afterDelete,
      },
      transforms: {
        OwnerId: toSalesforceUserId,
        ContactId: async function (prolibuContactId) {
          if (!prolibuContactId) return null;

          try {
            const contact = await prolibuApi.findOne('Contact', prolibuContactId, {
              select: 'email refId',
              populate: '*'
            });

            // Si ya tiene refId de Salesforce, usarlo
            if (contact?.refId) {
              return contact.refId;
            }

            // Buscar por email en Salesforce
            if (contact?.email) {
              const sfContacts = await salesforceApi.find('Contact', {
                where: `Email = '${contact.email.replace(/'/g, "\\'")}'`,
                limit: 1,
                select: 'Id'
              });

              return sfContacts.totalSize > 0 ? sfContacts.records[0].Id : null;
            }

            return null;
          } catch (error) {
            console.warn('Error mapeando contact:', error.message);
            return null;
          }
        },
        AccountId: async function (prolibuCompanyId) {

          // 🆕 Si no viene company, obtenerla del contact
          if (!prolibuCompanyId && eventData.doc?.contact) {
            try {
              const contact = await prolibuApi.findOne('Contact', eventData.doc.contact, {
                select: 'company'
              });

              if (contact?.company) {
                prolibuCompanyId = contact.company;
              }
            } catch (error) {
              console.warn('Error obteniendo company del contact para Deal:', error.message);
            }
          }

          if (!prolibuCompanyId) return null;

          try {
            const company = await prolibuApi.findOne('Company', prolibuCompanyId, {
              select: 'refId'
            });

            // Si ya tiene refId de Salesforce, verificar y activar Account
            if (company?.refId) {
              // 🆕 VERIFICAR Y CORREGIR EL ESTADO DEL ACCOUNT ANTES DE CREAR DEAL
              try {
                const sfAccount = await salesforceApi.findOne('Account', company.refId, {
                  select: 'Id, Estado_cliente__c, Ruta__c, Name, CreatedDate'
                });

                if (sfAccount) {

                  // 🆕 Verificar y corregir AMBOS campos necesarios para Opportunities
                  const needsUpdate = {
                    ...(sfAccount.Estado_cliente__c !== 'ACTIVO' && { Estado_cliente__c: 'ACTIVO' }),
                    ...(sfAccount.Ruta__c !== 'Activa' && { Ruta__c: 'Activa' })
                  };

                  if (Object.keys(needsUpdate).length > 0) {
                    await salesforceApi.update('Account', company.refId, needsUpdate);

                    // Verificar que se actualizó
                    await salesforceApi.findOne('Account', company.refId, {
                      select: 'Estado_cliente__c, Ruta__c'
                    });

                  }
                } else {
                  console.error('❌ [DEAL] No se encontró el Account en Salesforce');
                }

              } catch (accountError) {
                console.error('❌ [DEAL] Error verificando/activando Account:', accountError.message);
              }

              return company.refId;
            }

            return null;
          } catch (error) {
            console.warn('Error mapeando company para Deal:', error.message);
            return null;
          }
        }

      },
      afterTransforms: {
        StageName: function () {
          // 🔄 TODO: Los Stages (etapas) de prolibu estan diferentes a los de Salesforce
          return 'Captura de Necesidades';
        },
        CloseDate: function (value) {
          // 🔄 TODO: Es Requerida en salesforce pero en prolibu no
          if (value) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          }

          // Default: 30 días desde ahora
          const in30Days = new Date();
          in30Days.setDate(in30Days.getDate() + 30);
          return in30Days.toISOString().split('T')[0];
        },
        Ciudad_de_Inter_s__c: function (value) {
          return eventData.doc?.customFields?.ciudadDeInteres || value || 'Bogotá';
        },
        Hotel__c: function (value) {
          return eventData.doc?.customFields?.hotelPreferido || value || 'Hotel Distrito';
        }
      }
    },
  };

  const outboundIntegration = new OutboundIntegration(objectsConfig);
  await outboundIntegration.initialize();
})();
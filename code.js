
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

(async function() {

  const prolibuApi = new ProlibuApi({ apiKey: vars.prolibuApiKey });
  const salesforceApi = new SalesforceApi({
      instanceUrl: vars.salesforceInstanceUrl,
      customerKey: vars.salesforceCustomerKey,
      customerSecret: vars.salesforceCustomerSecret,
    });

  await salesforceApi.authenticate();

  // EVENT HANDLERS

  async function afterCreate(objectName, config) {
    console.log(eventData.doc);
    
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
        // Reflect changes in the response payload
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
        const data =  await DataMapper.map({
          data: eventData.payload,
          map: config.map,
          transforms: config.transforms,
          afterTransforms: config.afterTransforms,
        });

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
      // afterTransforms: {
      //    Tipo_de_Cuenta_cc__c: function() {
          
      //     return 'CASA MATRIZ';
      //   },
      // }
    },
    Contact: {
      active: true,
      map: require('../../../lib/vendors/salesforce/maps/ContactMap'),
      events: {
        'Contact.afterCreate': afterCreate,
        'Contact.afterUpdate': afterUpdate,
        'Contact.afterDelete': afterDelete,
      },
      transforms: {
        OwnerId: toSalesforceUserId,
      },
    },
    Deal: {
      active: true,
      mapToObject: 'Opportunity',
      map: {
        ...require('../../../lib/vendors/salesforce/maps/DealMap'),
      },
      events: {
        'Deal.afterCreate': afterCreate,
        'Deal.afterUpdate': afterUpdate,
        'Deal.afterDelete': afterDelete,
      },
      transforms: {
        OwnerId: toSalesforceUserId,
      },
      afterTransforms: {
        StageName: async function(prolibuStageId) {
          if (prolibuStageId) {
            const stage = await prolibuApi.findOne('Stage', prolibuStageId, { select: 'stageName' });
            return stage?.stageName || '--';
          }
          return '--';
        },
        CloseDate: function(value) {
          // If not provided, set to 30 days from now
          // Salesforce requires CloseDate to be set
          const closeDate = value || new Date().toISOString().split('T')[0];
          const in30Days = new Date();
          in30Days.setDate(in30Days.getDate() + 30);
          return closeDate;
        },
      }
    },
  };

  const outboundIntegration = new OutboundIntegration(objectsConfig);
  await outboundIntegration.initialize();
})();
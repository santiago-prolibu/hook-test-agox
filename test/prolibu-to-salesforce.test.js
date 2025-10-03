/**
 * @jest-environment node
 */
/* global getVariable describe, it, expect, scriptCode, env, beforeAll */

const { faker } = require('@faker-js/faker');

const { loadGlobalVariables } = require('../../../../lib/utils/test');
loadGlobalVariables('dev');
// const { getVariable } = require('../../../../lib/utils/variables');

const ProlibuApi = require('../../../../lib/vendors/prolibu/ProlibuApi');
const prolibuApiKey = getVariable(`prolibu-apiKey-${env}`);
const prolibuApi = new ProlibuApi({
  apiKey: prolibuApiKey,
});

const UserApi = require('../../../../lib/vendors/prolibu/UserApi');
const userApi = new UserApi({
  apiKey: prolibuApiKey,
});

const SalesforceApi = require('../../../../lib/vendors/salesforce/SalesforceApi');
const salesforceInstanceUrl = getVariable(`salesforce-instanceUrl-${env}`);
const customerKey = getVariable(`salesforce-customerKey-${env}`);
const customerSecret = getVariable(`salesforce-customerSecret-${env}`);

const isProd = (env === 'prod') ? true : false;

const salesforceApi = new SalesforceApi({
  instanceUrl: salesforceInstanceUrl,
  customerKey: customerKey,
  customerSecret: customerSecret,
  sandbox: isProd ? false : true,
});


// Reemplazar las líneas 38-40:

const timestamp = Date.now();
const contactEmail = faker.internet.email(); // 🚀 SIMPLE Y ÚNICO
const companyCode = `company-${faker.string.alphanumeric(8)}`; // 🚀 TAMBIÉN ÚNICO
let script;

// COMPANY
let company;
const razonSocial = `${faker.company.name()} S.A.S.`; // 🆕 Generar razón social única

const companyData = {
  companyCode,
  companyName: razonSocial, // 🆕 Usar la misma razón social
  primaryPhone: faker.phone.number(),
  address: {
    street: faker.location.streetAddress(),
    neighborhood: faker.location.county(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    postalCode: faker.location.zipCode(),
    country: 'US', // Keep US for testing states mapping
    location: {
      lat: parseFloat(faker.location.latitude()),
      long: parseFloat(faker.location.longitude()),
    },
  },
  website: faker.internet.url(),
  identification: {
    docType: faker.helpers.arrayElement(['NIT', 'RUT', 'TAX_ID', 'EIN']),
    docId: faker.string.alphanumeric({ length: 10 }),
  },
  locale: {
    currency: 'ALL', // 🧪 Moneda INVÁLIDA para probar transformación → COP
  },
  assignee: isProd
    ? 'juan.prieto@prolibu.com'
    : 'juan.prieto@prolibu.com',
  customFields: {
    tipoDeCuenta: 'CASA MATRIZ',
    numeroIdentificacionTributaria: faker.string.numeric({ length: 10 }),
    razonSocial: razonSocial, // 🆕 Usar la misma razón social
    tipoIdentificacionEmpresa: 'NIT',
    tipoDeCliente: 'EMPRESA',
    estadoDeCliente: 'ACTIVO',
    tipoDeEmpresa: 'NACIONAL',
    segmentoCliente: 'Diamante',
    macroSector: 'INDUSTRIA ENERGETICA', // 🧪 SIN acento para probar transformación → ENERGÉTICA
    necesitaCredito: 'SI',
  }
};

// 🧪 Casos de prueba para transforms
const testTransformCases = {
  currency: {
    input: 'ALL', // Moneda no válida
    expected: 'COP' // Debe mapear a COP
  },
  macroSector: {
    input: 'INDUSTRIA ENERGETICA', // Sin acento
    expected: 'INDUSTRIA ENERGÉTICA' // Con acento en SF
  },
  estadoCliente: {
    input: 'PENDIENTE', // Estado no estándar
    expected: 'ACTIVO' // Debe mapear a ACTIVO
  },
  tipoServicio: {
    input: 'Evento', // Singular en Prolibu
    expected: 'Eventos' // Plural en Salesforce
  }
};


// companyData.legalName = `${companyData.companyName} LLC.`;
const sfCompanySelect = 'Id, Name, Phone, Website, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry, CurrencyIsoCode OwnerId BillingLatitude BillingLongitude';

// CONTACT
let contact;
const contactData = {
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  email: contactEmail,
  mobile: faker.phone.number(),
  jobTitle: faker.person.jobTitle(),
  assignee: isProd
    ? 'juan.prieto@prolibu.com'
    : 'juan.prieto@prolibu.com',
  address: {
    street: faker.location.streetAddress(),
    neighborhood: faker.location.county(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    postalCode: faker.location.zipCode(),
    country: 'US', // Keep US for testing states mapping
    location: {
      lat: parseFloat(faker.location.latitude()),
      long: parseFloat(faker.location.longitude()),
    },
  },
};
const sfContactSelect = 'Id, FirstName, LastName, Email, MobilePhone, Title, OwnerId, MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry, MailingLatitude, MailingLongitude';


// DEAL
let deal;
const dealData = {
  dealCode: `DEAL-${faker.string.alphanumeric(8)}-${timestamp}`,
  dealName: faker.commerce.productName(),
  closeDate: faker.date.future().toISOString(),
  source: faker.helpers.arrayElement(['Web', 'Email', 'Phone', 'Referral', 'Social Media']),
};

const sfDealSelect = 'Id, Name, CloseDate, LeadSource';

describe('Prolibu ↔ Salesforce Integration', () => {
  describe('Authentication & Setup', () => {
    it('authenticates with Salesforce', async () => {
      await salesforceApi.authenticate();
      const accounts = await salesforceApi.find('Account', { limit: 1 });

      expect(accounts).toBeDefined();
      expect(accounts).toHaveProperty('totalSize');
      expect(accounts).toHaveProperty('records');
      expect(Array.isArray(accounts.records)).toBe(true);
    });

    it('authenticates with Prolibu', async () => {
      const data = await userApi.me();

      expect(data).toBeDefined();
      expect(data).toHaveProperty('profile');
      expect(data).toHaveProperty('modelSchemas');
      expect(data.modelSchemas).toHaveProperty('Script');
    });

    it('validates script configuration', async () => {
      script = await prolibuApi.findOne('Script', scriptCode);

      // console.log('*___ script:', script);
      expect(script).toBeDefined();
      expect(script).toHaveProperty('_id');
      expect(script).toHaveProperty('scriptName');
      expect(script).toHaveProperty('active', true);

      // lifecycleHooks should contain [ 'Contact', 'Company', 'Deal', 'Note' ]
      expect(script).toHaveProperty('lifecycleHooks');
      expect(script.lifecycleHooks).toContain('Contact');
      expect(script.lifecycleHooks).toContain('Company');
      expect(script.lifecycleHooks).toContain('Deal');
      expect(script.lifecycleHooks).toContain('Note');
    });
  });

  describe('Company → Account Sync', () => {
    // Reemplazar el test de limpieza:

    it('cleans up existing test data', async () => {
      // 🆕 Limpiar también de Salesforce

      // 1. Limpiar Deal de Prolibu
      let results = await prolibuApi.find('Deal', { dealCode: dealData.dealCode }, { select: '_id,refId' });
      if (results?.data?.length > 0) {
        console.log(`🗑️ Eliminando Deal existente: ${dealData.dealCode}`);
        for (const dealDoc of results.data) {
          // Eliminar de Salesforce si tiene refId
          if (dealDoc.refId) {
            try {
              await salesforceApi.delete('Opportunity', dealDoc.refId);
            } catch (error) {
              console.warn(`No se pudo eliminar Opportunity ${dealDoc.refId}:`, error.message);
            }
          }
          await prolibuApi.delete('Deal', dealDoc._id);
        }
      }

      // 2. Limpiar Contact de Prolibu y Salesforce
      results = await prolibuApi.find('Contact', { email: contactEmail }, { select: '_id,refId' });
      if (results?.data?.length > 0) {
        console.log(`🗑️ Eliminando Contact existente: ${contactEmail}`);
        for (const contactDoc of results.data) {
          if (contactDoc.refId) {
            try {
              await salesforceApi.delete('Contact', contactDoc.refId);
            } catch (error) {
              console.warn(`No se pudo eliminar Contact ${contactDoc.refId}:`, error.message);
            }
          }
          await prolibuApi.delete('Contact', contactDoc._id);
        }
      }

      // 🆕 Limpiar Contact por email en Salesforce
      try {
        const sfContacts = await salesforceApi.find('Contact', {
          where: `Email = '${contactEmail.replace(/'/g, "\\'")}'`,
          select: 'Id'
        });

        for (const sfContact of sfContacts.records) {
          try {
            await salesforceApi.delete('Contact', sfContact.Id);
            console.log(`🗑️ Contact eliminado de Salesforce: ${sfContact.Id}`);
          } catch (error) {
            console.warn(`No se pudo eliminar Contact SF ${sfContact.Id}:`, error.message);
          }
        }
      } catch (error) {
        console.warn('Error buscando contacts en Salesforce:', error.message);
      }

      // 3. Limpiar Company
      results = await prolibuApi.find('Company', { companyCode }, { select: '_id,refId' });
      if (results?.data?.length > 0) {
        console.log(`🗑️ Eliminando Company existente: ${companyCode}`);
        for (const companyDoc of results.data) {
          if (companyDoc.refId) {
            try {
              await salesforceApi.delete('Account', companyDoc.refId);
            } catch (error) {
              console.warn(`No se pudo eliminar Account ${companyDoc.refId}:`, error.message);
            }
          }
          await prolibuApi.delete('Company', companyDoc._id);
        }
      }

      console.log('✅ Limpieza completada');
    });

    describe('Creation & Updates', () => {
      it('creates company with Salesforce sync', async () => {
        company = await prolibuApi.create('company', companyData);

        // console.log('*____company:', company);

        expect(company).toBeDefined();
        expect(company).toHaveProperty('_id');
        expect(company).toHaveProperty('companyCode', companyData.companyCode);
        expect(company).toHaveProperty('companyName', companyData.companyName);
        expect(company).toHaveProperty('primaryPhone', companyData.primaryPhone);
        expect(company).toHaveProperty('address');
        expect(company.address).toHaveProperty('street', companyData.address.street);
        expect(company.address).toHaveProperty('city', companyData.address.city);
        expect(company.address).toHaveProperty('state', companyData.address.state);
        expect(company.address).toHaveProperty('postalCode', companyData.address.postalCode);
        expect(company.address).toHaveProperty('country', companyData.address.country);
        expect(company).toHaveProperty('website', companyData.website);
        expect(company).toHaveProperty('identification');
        expect(company.identification).toHaveProperty('docType', companyData.identification.docType);
        // expect(company.identification).toHaveProperty('docId', companyData.identification.docId);
        // Salesforce ref fields
        expect(company).toHaveProperty('refId');
        expect(company).toHaveProperty('refUrl');
        expect(company.assignee).toBeDefined();
      });

      it('verifies company in Salesforce', async () => {
        const sfCompany = await salesforceApi.findOne('Account', company.refId, {
          select: `${sfCompanySelect}, Macro_Sector__c, Estado_cliente__c, Ruta__c`,
        });

        // console.log('--- sfCompany after creation:', sfCompany);

        expect(sfCompany).toBeDefined();
        expect(sfCompany).toHaveProperty('Id', company.refId);
        expect(sfCompany).toHaveProperty('Name', company.customFields.razonSocial);
        expect(sfCompany).toHaveProperty('Phone', company.primaryPhone);
        expect(sfCompany).toHaveProperty('Website', company.website);
        expect(sfCompany).toHaveProperty('BillingStreet');
        expect(sfCompany).toHaveProperty('BillingCity', company.address.city);
        expect(sfCompany).toHaveProperty('BillingPostalCode', company.address.postalCode);
        expect(sfCompany).toHaveProperty('BillingCountry', 'United States');
        // expect(sfCompany).toHaveProperty('Tradestyle', company.legalName);
        expect(sfCompany).toHaveProperty('CurrencyIsoCode', 'COP');
        expect(sfCompany).toHaveProperty('OwnerId');
        expect(sfCompany).toHaveProperty('BillingState');
        expect(sfCompany).toHaveProperty('BillingLatitude', company.address.location.lat);
        expect(sfCompany).toHaveProperty('BillingLongitude', company.address.location.long);
      });

      // 🧪 Test específico para transformaciones custom
      it('validates custom field transformations', async () => {
        const sfCompany = await salesforceApi.findOne('Account', company.refId, {
          select: 'Id, Macro_Sector__c, Estado_cliente__c, Ruta__c, CurrencyIsoCode',
        });

        // ✅ Macro Sector debe transformarse de "INDUSTRIA ENERGETICA" → "INDUSTRIA ENERGÉTICA"
        expect(sfCompany).toHaveProperty('Macro_Sector__c', testTransformCases.macroSector.expected);

        // ✅ Estado Cliente debe estar en ACTIVO
        expect(sfCompany).toHaveProperty('Estado_cliente__c', 'ACTIVO');

        // ✅ Ruta debe estar "Activa" (requerida para Opportunities)
        expect(sfCompany).toHaveProperty('Ruta__c', 'Activa');

        // ✅ Currency debe ser COP (transformado desde ALL)
        expect(sfCompany).toHaveProperty('CurrencyIsoCode', testTransformCases.currency.expected);
      });


      it('handles field nullification', async () => {
        company = await prolibuApi.update('Company', company._id, {
          assignee: null,
          website: null,
        });
      });


      it('preserves required Salesforce fields', async () => {
        const sfCompany = await salesforceApi.findOne('Account', company.refId, {
          select: 'Id, Name, OwnerId, Website',
        });

        // console.log('--- sfCompany after unsetting assignee:', sfCompany);

        expect(sfCompany).toBeDefined();
        expect(sfCompany).toHaveProperty('Id', company.refId);
        expect(sfCompany).toHaveProperty('Name', company.customFields.razonSocial);
        expect(sfCompany).toHaveProperty('OwnerId');
        expect(sfCompany).toHaveProperty('Website', null);
      });

      it('updates company phone', async () => {
        const updatedData = {
          primaryPhone: faker.phone.number(),
        };

        company = await prolibuApi.update('Company', company._id, updatedData);

        expect(company).toBeDefined();
        expect(company).toHaveProperty('primaryPhone', updatedData.primaryPhone);
      });

      it('syncs phone update to Salesforce', async () => {
        const sfCompany = await salesforceApi.findOne('Account', company.refId, {
          select: 'Id, Name, Phone',
        });

        expect(sfCompany).toBeDefined();
        expect(sfCompany).toHaveProperty('Id', company.refId);
        expect(sfCompany).toHaveProperty('Phone', company.primaryPhone);
      });

      // 🧪 Test de diferentes transformaciones de Macro Sector
      it('tests various macro sector transformations', async () => {
        const macroSectorTests = [
          {
            prolibu: 'TRANSPORTE AÉREO',
            salesforce: 'TRANSPORTE AEREO',
            description: 'Quitar acento: AÉREO → AEREO'
          },
          {
            prolibu: 'EDUCACIÓN',
            salesforce: 'EDUACIÓN',
            description: 'Error SF: EDUCACIÓN → EDUACIÓN (sin C)'
          },
          {
            prolibu: 'AGENCIA DE VIAJES TMC',
            salesforce: 'AGENCIAS DE VIAJES TMC',
            description: 'Singular a plural: AGENCIA → AGENCIAS'
          }
        ];

        for (const testCase of macroSectorTests) {
          // Actualizar Macro Sector en Prolibu
          await prolibuApi.update('Company', company._id, {
            customFields: {
              ...company.customFields,
              macroSector: testCase.prolibu
            }
          });

          // Verificar transformación en Salesforce
          const sfCompany = await salesforceApi.findOne('Account', company.refId, {
            select: 'Id, Macro_Sector__c',
          });

          expect(sfCompany.Macro_Sector__c).toBe(testCase.salesforce);
        }
      });
    });
    describe('Contact Sync', () => {
      it('creates contact with Salesforce sync', async () => {

        // 🆕 Asociar contact con company
        const contactDataWithCompany = {
          ...contactData,
          company: company._id, // Asociar con la company creada
        };

        contact = await prolibuApi.create('contact', contactDataWithCompany);

        // console.log('*____contact:', contact);

        expect(contact).toBeDefined();
        expect(contact).toHaveProperty('_id');
        expect(contact).toHaveProperty('firstName', contactData.firstName);
        expect(contact).toHaveProperty('lastName', contactData.lastName);
        expect(contact.email.toLowerCase()).toBe(contactData.email.toLowerCase());
        expect(contact).toHaveProperty('mobile', contactData.mobile);
        expect(contact).toHaveProperty('jobTitle', contactData.jobTitle);
        expect(contact).toHaveProperty('assignee');
        expect(contact).toHaveProperty('refId');
        expect(contact).toHaveProperty('refUrl');
        expect(contact).toHaveProperty('company', company._id); // 🆕 Verificar asociación
      });

      it('verifies contact in Salesforce', async () => {
        const sfContact = await salesforceApi.findOne('Contact', contact.refId, {
          select: `${sfContactSelect}, AccountId`,
        });

        // console.log('--- sfContact after creation:', sfContact);

        expect(sfContact).toBeDefined();
        expect(sfContact).toHaveProperty('Id', contact.refId);
        expect(sfContact).toHaveProperty('FirstName', contact.firstName);
        expect(sfContact).toHaveProperty('LastName', contact.lastName);
        expect(sfContact).toHaveProperty('Email', contact.email.toLowerCase());
        expect(sfContact).toHaveProperty('MobilePhone', contact.mobile);
        expect(sfContact).toHaveProperty('Title', contact.jobTitle);
        expect(sfContact).toHaveProperty('OwnerId');
        expect(sfContact).toHaveProperty('MailingStreet');
        expect(sfContact).toHaveProperty('MailingCity', contact.address.city);
        expect(sfContact).toHaveProperty('MailingPostalCode', contact.address.postalCode);
        expect(sfContact).toHaveProperty('MailingCountry', 'United States');
        expect(sfContact).toHaveProperty('MailingState');
        expect(sfContact).toHaveProperty('MailingLatitude', contact.address.location.lat);
        expect(sfContact).toHaveProperty('MailingLongitude', contact.address.location.long);
      });

      // 🧪 Test de asociación Contact → Account
      it('validates contact is linked to account', async () => {
        const sfContact = await salesforceApi.findOne('Contact', contact.refId, {
          select: 'Id, AccountId',
        });

        // ✅ Contact debe estar asociado al Account correcto
        expect(sfContact).toHaveProperty('AccountId', company.refId);

        // ✅ Verificar que el Account sigue activo después de la asociación
        const sfAccount = await salesforceApi.findOne('Account', company.refId, {
          select: 'Id, Estado_cliente__c, Ruta__c',
        });

        expect(sfAccount).toHaveProperty('Estado_cliente__c', 'ACTIVO');
        expect(sfAccount).toHaveProperty('Ruta__c', 'Activa');
      });

      it('updates contact mobile', async () => {
        const updatedData = {
          mobile: faker.phone.number(),
        };

        contact = await prolibuApi.update('Contact', contact._id, updatedData);

        expect(contact).toBeDefined();
        expect(contact).toHaveProperty('mobile', updatedData.mobile);
      });

      it('syncs mobile update to Salesforce', async () => {
        const sfContact = await salesforceApi.findOne('Contact', contact.refId, {
          select: 'Id, FirstName, LastName, MobilePhone',
        });

        expect(sfContact).toBeDefined();
        expect(sfContact).toHaveProperty('Id', contact.refId);
        expect(sfContact).toHaveProperty('MobilePhone', contact.mobile);
      });
    });
    describe('Deal → Opportunity Sync', () => {
      it('creates deal with Salesforce sync', async () => {

        const dealDataWithRefs = {
          ...dealData,
          contact: contact._id,    // Usar el ID del contacto creado
          company: company._id,    // Usar el ID de la company creada
          customFields: {
            tipoEvento: 'Hospedaje',
            numeroDePersonas: 25,
            numeroDeHabitaciones: 12,
            fechaHoraIngreso: '2025-10-15T15:00:00.000Z',
            fechaHoraSalida: '2025-10-17T11:00:00.000Z',
            ciudadDeInteres: 'Bogotá',
            hotelPreferido: 'Hotel Distrito', // ✅ Hotel válido para Bogotá (validFor: gAAA)
            detalleDelRequerimiento: 'Evento corporativo con hospedaje para 25 personas',
          }
        };

        deal = await prolibuApi.create('Deal', dealDataWithRefs);

        // console.log('*____deal:', deal);

        expect(deal).toBeDefined();
        expect(deal).toHaveProperty('dealName', dealData.dealName);
        expect(deal).toHaveProperty('closeDate', dealData.closeDate);
        expect(deal).toHaveProperty('source', dealData.source);
        expect(deal).toHaveProperty('contact', contact._id);  // ✅ Verificar que tiene contacto
        expect(deal).toHaveProperty('company', company._id);  // ✅
        expect(deal).toHaveProperty('refId');
        expect(deal).toHaveProperty('refUrl');
      });

      it('verifies deal as Opportunity in Salesforce', async () => {
        const sfDeals = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: sfDealSelect,
        });

        // console.log('--- sfDeals after creation:', sfDeals);

        expect(sfDeals).toBeDefined();
        expect(sfDeals).toHaveProperty('Id');
        expect(sfDeals).toHaveProperty('Name', deal.dealName);
        expect(sfDeals).toHaveProperty('CloseDate', deal.closeDate.split('T')[0]);
        expect(sfDeals).toHaveProperty('LeadSource', deal.source);
      });

      // 🧪 Test de campos requeridos por Salesforce en Opportunity
      it('validates Salesforce required fields are set correctly', async () => {
        const sfOpp = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: 'Id, Name, StageName, CloseDate, AccountId, ContactId, OwnerId',
        });

        // ✅ Campos obligatorios de Salesforce
        expect(sfOpp).toHaveProperty('Name'); // Required
        expect(sfOpp.Name).toBeTruthy(); // No vacío

        expect(sfOpp).toHaveProperty('StageName'); // Required
        expect(sfOpp.StageName).toBe('Captura de Necesidades'); // Default esperado

        expect(sfOpp).toHaveProperty('CloseDate'); // Required
        expect(sfOpp.CloseDate).toBeTruthy(); // No vacío

        expect(sfOpp).toHaveProperty('AccountId'); // Required para crear
        expect(sfOpp.AccountId).toBe(company.refId); // Debe apuntar a la company correcta

        expect(sfOpp).toHaveProperty('ContactId'); // Importante para seguimiento
        expect(sfOpp.ContactId).toBe(contact.refId); // Debe apuntar al contact correcto

        expect(sfOpp).toHaveProperty('OwnerId'); // Required
        expect(sfOpp.OwnerId).toBeTruthy(); // Debe tener un owner
      });

      // 🧪 Test de custom fields específicos de Prolibu
      it('validates custom Prolibu fields are mapped correctly', async () => {
        const sfOpp = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: `Id, Tipo_de_Servicio__c, N_mero_de_Asistentes__c, N_mero_de_Habitaciones__c, 
                   Fecha_Check_In__c, Fecha_Check_Out__c, Ciudad_de_Inter_s__c, Hotel__c, Description`,
        });

        // ✅ Custom fields de Prolibu
        expect(sfOpp).toHaveProperty('Tipo_de_Servicio__c', 'Hospedaje');
        expect(sfOpp).toHaveProperty('N_mero_de_Asistentes__c', 25);

        // ⚠️ numeroDeHabitaciones puede ser null si no es requerido en Prolibu
        // Solo validamos si tiene valor
        if (deal.customFields.numeroDeHabitaciones) {
          expect(sfOpp.N_mero_de_Habitaciones__c).toBe(12);
        }

        expect(sfOpp.Fecha_Check_In__c).toMatch(/2025-10-15T15:00:00.000/);
        expect(sfOpp.Fecha_Check_Out__c).toMatch(/2025-10-17T11:00:00.000/);
        expect(sfOpp).toHaveProperty('Ciudad_de_Inter_s__c', 'Bogotá');
        expect(sfOpp).toHaveProperty('Hotel__c', 'Hotel Distrito'); // ✅ Hotel válido para Bogotá
        expect(sfOpp).toHaveProperty('Description', 'Evento corporativo con hospedaje para 25 personas');
      });

      // 🧪 Test de transformación de Tipo de Servicio
      it('validates tipo de servicio transformations', async () => {
        const tipoServicioTests = [
          {
            prolibu: 'Evento',
            salesforce: 'Eventos',
            description: 'Singular → Plural'
          },
          {
            prolibu: 'Hospedaje + Evento',
            salesforce: 'Hospedaje - Eventos',
            description: '+ → - y plural'
          },
          {
            prolibu: 'Hospedaje',
            salesforce: 'Hospedaje',
            description: 'Sin cambios'
          }
        ];

        for (const testCase of tipoServicioTests) {
          // Crear Deal con tipo de servicio específico
          const testDeal = await prolibuApi.create('Deal', {
            dealName: `Test ${testCase.prolibu} ${faker.string.alphanumeric(4)}`,
            closeDate: faker.date.future().toISOString(),
            source: 'Web',
            contact: contact._id,
            company: company._id,
            customFields: {
              tipoEvento: testCase.prolibu,
              numeroDePersonas: 10,
              ciudadDeInteres: 'Bogotá',
            }
          });

          expect(testDeal).toHaveProperty('refId');

          // Verificar transformación en Salesforce
          const sfOpp = await salesforceApi.findOne('Opportunity', testDeal.refId, {
            select: 'Id, Tipo_de_Servicio__c',
          });

          expect(sfOpp.Tipo_de_Servicio__c).toBe(testCase.salesforce);

          // Cleanup: Solo de Prolibu (Salesforce se limpia automáticamente)
          await prolibuApi.delete('Deal', testDeal._id);
        }
      }, 10000); // 🔧 Aumentar timeout a 10s para 3 iteraciones (~2.2s cada una)

      // 🧪 Test de defaults aplicados por transforms
      it('validates default values are applied when fields are missing', async () => {
        // Crear un Deal sin algunos campos opcionales
        const minimalDealData = {
          dealName: `Minimal Deal ${faker.string.alphanumeric(6)}`,
          closeDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(), // +45 días
          source: 'Email',
          contact: contact._id,
          company: company._id,
          customFields: {
            tipoEvento: 'Evento', // ✅ Valor válido del enum (Hospedaje, Evento, Hospedaje + Evento, Evento Interno)
            numeroDePersonas: 10,
            ciudadDeInteres: 'Medellín', // ✅ Con acento (valor válido del enum de Prolibu)
            // ❌ SIN: hotelPreferido (opcional, debe aplicar default según ciudad)
          }
        };

        const minimalDeal = await prolibuApi.create('Deal', minimalDealData);

        expect(minimalDeal).toHaveProperty('refId');

        // Verificar defaults en Salesforce
        const sfOpp = await salesforceApi.findOne('Opportunity', minimalDeal.refId, {
          select: 'Id, StageName, CloseDate, Ciudad_de_Inter_s__c, Hotel__c',
        });

        // ✅ StageName debe tener default
        expect(sfOpp.StageName).toBe('Captura de Necesidades');

        // ✅ Ciudad debe mantener el valor enviado "Medellín"
        expect(sfOpp.Ciudad_de_Inter_s__c).toBe('Medellín');

        // ✅ Hotel debe usar default según la ciudad = "Hotel Fairfield Sabaneta" para Medellín
        expect(sfOpp.Hotel__c).toBe('Hotel Fairfield Sabaneta');

        // Cleanup: Solo de Prolibu (Salesforce se limpia automáticamente)
        await prolibuApi.delete('Deal', minimalDeal._id);
      });

      // 🧪 Test de UPDATE en Deal → Opportunity
      it('updates deal name and syncs to Salesforce', async () => {
        const newDealName = `Updated Deal ${faker.string.alphanumeric(6)}`;

        deal = await prolibuApi.update('Deal', deal._id, {
          dealName: newDealName,
        });

        expect(deal).toHaveProperty('dealName', newDealName);

        // Verificar sincronización en Salesforce
        const sfOpp = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: 'Id, Name',
        });

        expect(sfOpp.Name).toBe(newDealName);
      });

      // 🧪 Test de UPDATE de custom fields
      it('updates custom fields and syncs to Salesforce', async () => {
        const updates = {
          customFields: {
            ...deal.customFields,
            numeroDePersonas: 50, // Cambiar de 25 a 50
            ciudadDeInteres: 'Medellín', // Cambiar de Bogotá a Medellín
            hotelPreferido: 'Hotel Fairfield Sabaneta', // ✅ Hotel válido para Medellín (validFor: AQAA)
          }
        };

        deal = await prolibuApi.update('Deal', deal._id, updates);

        // Verificar sincronización en Salesforce
        const sfOpp = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: 'Id, N_mero_de_Asistentes__c, Ciudad_de_Inter_s__c, Hotel__c',
        });

        expect(sfOpp.N_mero_de_Asistentes__c).toBe(50);
        expect(sfOpp.Ciudad_de_Inter_s__c).toBe('Medellín');
        expect(sfOpp.Hotel__c).toBe('Hotel Fairfield Sabaneta'); // ✅ Hotel válido para Medellín
      });

      // 🧪 Test de UPDATE de CloseDate
      it('updates closeDate and validates format in Salesforce', async () => {
        const newCloseDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // +60 días

        deal = await prolibuApi.update('Deal', deal._id, {
          closeDate: newCloseDate,
        });

        expect(deal.closeDate).toBe(newCloseDate);

        // Verificar formato de fecha en Salesforce (YYYY-MM-DD)
        const sfOpp = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: 'Id, CloseDate',
        });

        expect(sfOpp.CloseDate).toBe(newCloseDate.split('T')[0]);
      });

      // 🧪 Test de UPDATE parcial (solo algunos campos)
      it('handles partial updates without affecting other fields', async () => {
        // Guardar valores actuales
        const currentNumPersonas = deal.customFields.numeroDePersonas;
        const currentCiudad = deal.customFields.ciudadDeInteres;

        // Update solo descripción
        deal = await prolibuApi.update('Deal', deal._id, {
          customFields: {
            ...deal.customFields,
            detalleDelRequerimiento: 'Nueva descripción actualizada',
          }
        });

        // Verificar que otros campos NO cambiaron
        const sfOpp = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: 'Id, Description, N_mero_de_Asistentes__c, Ciudad_de_Inter_s__c',
        });

        expect(sfOpp.Description).toBe('Nueva descripción actualizada');
        expect(sfOpp.N_mero_de_Asistentes__c).toBe(currentNumPersonas); // ✅ No cambió
        expect(sfOpp.Ciudad_de_Inter_s__c).toBe(currentCiudad); // ✅ No cambió
      });

      // 🧪 Test de validación de relaciones Account/Contact
      it('validates Account and Contact relationships remain intact after updates', async () => {
        // Hacer varios updates
        await prolibuApi.update('Deal', deal._id, { dealName: 'Test Relaciones' });

        const sfOpp = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: 'Id, Name, AccountId, ContactId',
        });

        // ✅ Las relaciones deben mantenerse
        expect(sfOpp.AccountId).toBe(company.refId);
        expect(sfOpp.ContactId).toBe(contact.refId);
        expect(sfOpp.Name).toBe('Test Relaciones');
      });
    });


  });
});
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

const contactEmail = 'salesforce-integration@test.com';
const companyCode = `acme-inc-salesforce-integration-${Date.now()}`;

let script;

// COMPANY
let company;
const companyData = {
  companyCode,
  companyName: faker.company.name(),
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
    currency: 'COP',
  },
  assignee: isProd
    ? 'juan.prieto@prolibu.com'
    : 'juan.prieto@prolibu.com',
    customFields: {
      tipoDeCuenta: 'CASA MATRIZ',
      numeroIdentificacionTributaria: faker.string.numeric({ length: 10 }),
      razonSocial: 'Test Company S.A.S.',
      tipoIdentificacionEmpresa: 'NIT',
      tipoDeCliente: 'EMPRESA',
      estadoDeCliente: 'ACTIVO',
      tipoDeEmpresa: 'NACIONAL',
      segmentoCliente: 'Diamante',
      macroSector: 'AGENCIAS DE VIAJES TMC',
      necesitaCredito: 'SI',
    }
};
console.log(companyData);


// companyData.legalName = `${companyData.companyName} LLC.`;
const sfCompanySelect = 'Id, Name, Phone, Website, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry, CurrencyIsoCode OwnerId BillingLatitude BillingLongitude';

// CONTACT
let contact;
const contactData = {
  firstName: 'Salesforce',
  lastName: 'Integration',
  email: contactEmail,
  mobile: faker.phone.number(),
  jobTitle: 'QA Engineer',
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
  dealCode: 'DEAL-SF-INTEGRATION-001',
  dealName: 'Test Deal from Integration',
  closeDate: '2025-10-01T00:00:00.000Z', // YYYY-MM-DD
  source: 'Web',
}

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
    it('cleans up existing test data', async () => {
      // Company
      let results = await prolibuApi.find('Company', { companyCode}, { select: '_id'});
      if (results?.data?.length > 0) {
        expect(results.data[0]).toHaveProperty('_id');
        await prolibuApi.delete('Company', companyCode);
        results = await prolibuApi.find('Company', { companyCode}, { select: '_id'});
        expect(results.data.length).toBe(0);
      }
      // Contact
      results = await prolibuApi.find('Contact', { email: contactEmail}, { select: '_id'});
      if (results?.data?.length > 0) {
        expect(results.data[0]).toHaveProperty('_id');
        await prolibuApi.delete('Contact', contactEmail);
        results = await prolibuApi.find('Contact', { email: contactEmail}, { select: '_id'});
        expect(results.data.length).toBe(0);
      }
      // Deal
      results = await prolibuApi.find('Deal', { dealCode: dealData.dealCode}, { select: '_id'});
      if (results?.data?.length > 0) {
        expect(results.data[0]).toHaveProperty('_id');
        await prolibuApi.delete('Deal', dealData.dealCode);
        results = await prolibuApi.find('Deal', { dealCode: dealData.dealCode}, { select: '_id'});
        expect(results.data.length).toBe(0);
      }
    });

    describe('Creation & Updates', () => {
      it('creates company with Salesforce sync', async () => {
        company = await prolibuApi.create('company', companyData);

        console.log('*____company:', company);
        
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
          select: sfCompanySelect,
        });

        console.log('--- sfCompany after creation:', sfCompany);

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
    });
    describe('Contact Sync', () => {
      it('creates contact with Salesforce sync', async () => {

        contact = await prolibuApi.create('contact', contactData);

        // console.log('*____contact:', contact);

        expect(contact).toBeDefined();
        expect(contact).toHaveProperty('_id');
        expect(contact).toHaveProperty('firstName', contactData.firstName);
        expect(contact).toHaveProperty('lastName', contactData.lastName);
        expect(contact).toHaveProperty('email', contactData.email);
        expect(contact).toHaveProperty('mobile', contactData.mobile);
        expect(contact).toHaveProperty('jobTitle', contactData.jobTitle);
        expect(contact).toHaveProperty('assignee');
        expect(contact).toHaveProperty('refId');
        expect(contact).toHaveProperty('refUrl');
      });

      it('verifies contact in Salesforce', async () => {
        const sfContact = await salesforceApi.findOne('Contact', contact.refId, {
          select: sfContactSelect,
        });

        // console.log('--- sfContact after creation:', sfContact);

        expect(sfContact).toBeDefined();
        expect(sfContact).toHaveProperty('Id', contact.refId);
        expect(sfContact).toHaveProperty('FirstName', contact.firstName);
        expect(sfContact).toHaveProperty('LastName', contact.lastName);
        expect(sfContact).toHaveProperty('Email', contact.email);
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

        deal = await prolibuApi.create('Deal', dealData);

        // console.log('*____deal:', deal);

        expect(deal).toBeDefined();
        expect(deal).toHaveProperty('dealName', dealData.dealName);
        expect(deal).toHaveProperty('closeDate', dealData.closeDate);
        expect(deal).toHaveProperty('source', dealData.source);
        expect(deal).toHaveProperty('refId');
        expect(deal).toHaveProperty('refUrl');
      });

return;

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
    });
return;

    describe('Cascade Deletion', () => {
      it('deletes company from both systems', async () => {
        await prolibuApi.delete('Company', company._id);
        const results = await prolibuApi.findOne('Company', company._id, { select: '_id' });
        expect(results).toBeNull();
      });

      it('confirms company deletion in Salesforce', async () => {
        const sfCompany = await salesforceApi.findOne('Account', company.refId, {
          select: 'Id, Name, Phone',
        });

        expect(sfCompany).toBeNull();
      });

      it('deletes contact from both systems', async () => {
        await prolibuApi.delete('Contact', contact._id);
        const results = await prolibuApi.findOne('Contact', contact._id, { select: '_id' });
        expect(results).toBeNull();
      });

      it('confirms contact deletion in Salesforce', async () => {
        const sfContact = await salesforceApi.findOne('Contact', contact.refId, {
          select: 'Id, FirstName, LastName, MobilePhone',
        });

        expect(sfContact).toBeNull();
      });

      it('deletes deal from both systems', async () => {
        await prolibuApi.delete('Deal', deal._id);
        const results = await prolibuApi.findOne('Deal', deal._id, { select: '_id' });
        expect(results).toBeNull();
      });

      it('confirms deal deletion in Salesforce', async () => {
        const sfDeal = await salesforceApi.findOne('Opportunity', deal.refId, {
          select: 'Id, Name, CloseDate',
        });

        expect(sfDeal).toBeNull();
      });
    });
  });
});
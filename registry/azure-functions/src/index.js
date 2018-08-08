const msRestAzure = require('ms-rest-azure')
const { ResourceManagementClient } = require('azure-arm-resource')
const StorageManagementClient = require('azure-arm-storage')
const pack = require('./pack')
const axios = require('axios')

async function createFunction(
  {
    name,
    subscriptionId,
    resourceGroup,
    tenant,
    clientId,
    clientSecret,
    root,
    storageAccountName,
    appServicePlanName,
    location,
    runtime,
    env
  },
  context
) {
  const path = root || context.projectPath
  const pkg = await pack(path)

  const credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenant, clientSecret)
  const resourceClient = new ResourceManagementClient(credentials, subscriptionId)
  const storageClient = new StorageManagementClient(credentials, subscriptionId)

  var groupParameters = { location: location, tags: { source: 'serverless-framework' } }

  context.log('Creating resource group: ' + resourceGroup)

  await resourceClient.resourceGroups.createOrUpdate(resourceGroup, groupParameters)

  var planParameters = {
    properties: {
      sku: 'Dynamic',
      computeMode: 'Dynamic',
      name: appServicePlanName
    },
    location: location
  }

  context.log(`Creating hosting plan: ${appServicePlanName}`)
  await resourceClient.resources.createOrUpdate(
    resourceGroup,
    'Microsoft.Web',
    '',
    'serverFarms',
    appServicePlanName,
    '2015-04-01',
    planParameters
  )

  context.log(`Creating storage account: ${storageAccountName}`)
  var storageParameters = {
    location: location,
    sku: {
      name: 'Standard_LRS'
    }
  }

  await resourceClient.resources.createOrUpdate(
    resourceGroup,
    'Microsoft.Storage',
    '',
    'storageAccounts',
    storageAccountName,
    '2018-02-01',
    storageParameters
  )

  let storageKeyResult = await storageClient.storageAccounts.listKeys(
    resourceGroup,
    storageAccountName
  )

  let storageKey = storageKeyResult.keys[0].value
  let storageConnectionString = `DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageKey};EndpointSuffix=core.windows.net`

  context.log(`Creating function app: ${name}`)

  var functionAppSettings = generateAppSettings({
    name,
    storageConnectionString,
    nodeVersion: runtime == 'nodejs10' ? '10.7.0' : '8.11.1',
    env
  })

  var functionAppParameters = {
    location: location,
    kind: 'functionapp',
    properties: {
      serverFarmId: appServicePlanName,
      siteConfig: { appSettings: functionAppSettings }
    }
  }

  let options = {
    method: 'PUT',
    url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}?api-version=2016-08-01`,
    body: functionAppParameters
  }

  await resourceClient.sendRequest(options)

  options = {
    method: 'POST',
    url: `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}/config/publishingcredentials/list?api-version=2016-08-01`,
    body: null
  }

  let publishingCredentials = await resourceClient.sendRequest(options)

  context.log(`Publishing function code...`)

  await axios.post(`https://${name}.scm.azurewebsites.net/api/zipdeploy`, pkg, {
    auth: {
      username: publishingCredentials.properties.publishingUserName,
      password: publishingCredentials.properties.publishingPassword
    }
  })

  context.log(`Function published.`)

  return {
    functionId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${name}`
  }
}

async function deploy(inputs, context) {
  // If name is not included, add it from config key
  if (!inputs.name) inputs.name = context.id.split(':')[1]

  // az ad sp create-for-rbac -n "jehollan-serverlessframework" --role contributor  \
  // --scopes /subscriptions/ef90e930-9d7f-4a60-8a99-748e0eea69de

  // TODO: call the default Azure Role component

  // TODO: do the decision tree on create or update (if necessary)

  let outputs = await createFunction(inputs, context)

  context.saveState({ ...inputs, ...outputs })
}

function remove(inputs, context) {
  context.log('removing functions')
}

module.exports = {
  deploy,
  remove
}

function generateAppSettings({ name, storageConnectionString, nodeVersion }) {
  return [
    {
      name: 'AzureWebJobsStorage',
      value: storageConnectionString
    },
    {
      name: 'FUNCTIONS_EXTENSION_VERSION',
      value: 'beta'
    },
    {
      name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING',
      value: storageConnectionString
    },
    {
      name: 'WEBSITE_CONTENTSHARE',
      value: name.toLowerCase()
    },
    {
      name: 'WEBSITE_NODE_DEFAULT_VERSION',
      value: nodeVersion
    },
    {
      name: 'WEBSITE_RUN_FROM_ZIP',
      value: '1'
    },
    {
      name: 'AzureWebJobsDashboard',
      value: ''
    }
  ]
}

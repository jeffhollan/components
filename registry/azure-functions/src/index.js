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
    root /*, runtime, description, env */
  },
  context
) {
  context.log('Authenticating and creating clients...')

  const path = root || context.projectPath
  const pkg = await pack(path)

  const credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenant, clientSecret)
  const resourceClient = new ResourceManagementClient(credentials, subscriptionId)
  const storageClient = new StorageManagementClient(credentials, subscriptionId)

  const storageAccountName = 'serverlessstorage1222'
  const appServicePlanName = 'serverless-westus'
  const functionLocation = 'westus'

  var groupParameters = { location: functionLocation, tags: { source: 'serverless-framework' } }

  context.log('Creating resource group: ' + resourceGroup)

  await resourceClient.resourceGroups.createOrUpdate(resourceGroup, groupParameters)

  context.log('Resource group created')

  var planParameters = {
    properties: {
      sku: 'Dynamic',
      computeMode: 'Dynamic',
      name: appServicePlanName
    },
    location: functionLocation
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
    location: functionLocation,
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
  let storageKey = storageKeyResult.keys[0]

  context.log(`Creating function app: ${name}`)

  var functionAppSettings = [
    {
      name: 'AzureWebJobsStorage',
      value: `DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageKey}`
    },
    {
      name: 'FUNCTIONS_EXTENSION_VERSION',
      value: 'beta'
    },
    {
      name: 'WEBSITE_NODE_DEFAULT_VERSION',
      value: '8.11.0' /* this would correspond to node runtime specified */
    }
  ]
  var functionAppParameters = {
    location: functionLocation,
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

  context.log(JSON.stringify(publishingCredentials))

  let zipResponse = await axios.post(`https://${name}.scm.azurewebsites.net/api/zipdeploy`, pkg, {
    auth: {
      username: publishingCredentials.properties.publishingUserName,
      password: publishingCredentials.properties.publishingPassword
    }
  })

  context.log(JSON.stringify(zipResponse))

  return {}
}

async function deploy(inputs, context) {
  // If name is not included, add it from config key
  if (!inputs.name) inputs.name = context.id.split(':')[1]

  // az ad sp create-for-rbac -n "jehollan-serverlessframework" --role contributor  \
  // --scopes /subscriptions/ef90e930-9d7f-4a60-8a99-748e0eea69de

  // TODO: call the default Azure Role component

  // TODO: do the decision tree on create or update (if necessary)

  context.log('about to call createFunction')
  let outputs = await createFunction(inputs, context)

  context.log('about to save state')
  context.saveState({ ...inputs, ...outputs })
}

function remove(inputs, context) {
  context.log('removing functions')
}

module.exports = {
  deploy,
  remove
}

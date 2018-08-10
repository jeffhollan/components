const msRestAzure = require('ms-rest-azure')
const StorageManagementClient = require('azure-arm-storage')
const azureStorage = require('azure-storage')

async function createStorage(
  { name, container, subscriptionId, resourceGroup, tenant, clientId, clientSecret, location },
  context
) {
  const credentials = new msRestAzure.ApplicationTokenCredentials(clientId, tenant, clientSecret)
  const storageClient = new StorageManagementClient(credentials, subscriptionId)

  context.log(`Creating storage account: ${name}`)
  let storageParameters = {
    location: location,
    sku: {
      name: 'Standard_LRS'
    },
    kind: 'Storage'
  }

  await storageClient.storageAccounts.create(resourceGroup, name, storageParameters)

  let storageKeyResult = await storageClient.storageAccounts.listKeys(resourceGroup, name)

  let storageKey = storageKeyResult.keys[0].value
  let storageConnectionString = `DefaultEndpointsProtocol=https;AccountName=${name};AccountKey=${storageKey};EndpointSuffix=core.windows.net`

  let blobClient = azureStorage.createBlobService(storageConnectionString)
  blobClient.createContainerIfNotExists(container, (err, result) => {
    if (err) {
      throw err
    }
    context.log(result)
    return result
  })
}

async function deploy(inputs, context) {
  let outputs = await createStorage(inputs, context)

  context.saveState({ ...inputs, ...outputs })
}

function remove(inputs, context) {
  context.log('removing storage')
}

module.exports = {
  deploy,
  remove
}

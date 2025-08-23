# SummarizerApi

All URIs are relative to *http://localhost*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getSummary**](#getsummary) | **POST** /api/summarizer/get-summary | Get summary by book ID|
|[**requestSummary**](#requestsummary) | **POST** /api/summarizer/request | Request book summarization|

# **getSummary**
> SummaryResponse getSummary(getSummaryDto)

Retrieves a summary for a specific book by its ID

### Example

```typescript
import {
    SummarizerApi,
    Configuration,
    GetSummaryDto
} from './api';

const configuration = new Configuration();
const apiInstance = new SummarizerApi(configuration);

let getSummaryDto: GetSummaryDto; //

const { status, data } = await apiInstance.getSummary(
    getSummaryDto
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **getSummaryDto** | **GetSummaryDto**|  | |


### Return type

**SummaryResponse**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Summary retrieved successfully |  -  |
|**400** | Invalid input data |  -  |
|**401** | Unauthorized |  -  |
|**404** | Book not found or summary not available |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **requestSummary**
> SummaryRequestResponse requestSummary(requestSummaryDto)

Queues a book for summarization processing or returns existing summary key if already available

### Example

```typescript
import {
    SummarizerApi,
    Configuration,
    RequestSummaryDto
} from './api';

const configuration = new Configuration();
const apiInstance = new SummarizerApi(configuration);

let requestSummaryDto: RequestSummaryDto; //

const { status, data } = await apiInstance.requestSummary(
    requestSummaryDto
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **requestSummaryDto** | **RequestSummaryDto**|  | |


### Return type

**SummaryRequestResponse**

### Authorization

[bearer](../README.md#bearer)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**202** | Summary request queued successfully or summary already exists |  -  |
|**400** | Invalid input data |  -  |
|**401** | Unauthorized |  -  |
|**404** | Book not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)


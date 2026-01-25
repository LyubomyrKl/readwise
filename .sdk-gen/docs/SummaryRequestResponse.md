# SummaryRequestResponse


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**success** | **boolean** | Whether the request was successful | [default to undefined]
**message** | **string** | Response message | [default to undefined]
**userId** | **string** | User ID who requested the summary | [default to undefined]
**bookId** | **string** | Book ID that was queued for summarization | [default to undefined]
**summaryKey** | **string** | S3 key of existing summary (if summary already exists) | [optional] [default to undefined]

## Example

```typescript
import { SummaryRequestResponse } from './api';

const instance: SummaryRequestResponse = {
    success,
    message,
    userId,
    bookId,
    summaryKey,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)

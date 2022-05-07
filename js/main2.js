"use strict";
const NOTION_HEADERS = {
    "Content-type": "application/json",
    Authorization: "Bearer " + NOTION_TOKEN,
    "Notion-Version": "2022-02-22",
};
const INSTAGRAM_API_VERSION = "v13.0";
const INSTAGRAM_MEDIA_URL = `https://graph.facebook.com/${INSTAGRAM_API_VERSION}/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`;
const INSTAGRAM_MEDIA_PUBLISH_URL = `https://graph.facebook.com/${INSTAGRAM_API_VERSION}/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`;
const sleep = (ms) => {
    const d1 = new Date().getTime();
    while (true) {
        const d2 = new Date().getTime();
        if ((d2 - d1) > ms) {
            break;
        }
    }
};
const queryCheckedNotionData = () => {
    const url = "https://api.notion.com/v1/databases/" + NOTION_DATABASE_ID + "/query";
    const filter = {
        filter: {
            and: [{ property: "Instagramに投稿予定", checkbox: { equals: true } }],
        },
    };
    const options = {
        method: "post",
        headers: NOTION_HEADERS,
        payload: JSON.stringify(filter),
    };
    const res = UrlFetchApp.fetch(url, options);
    const resJson = JSON.parse(res.getContentText());
    return resJson.results;
};
const retrieveNotionPage = (pageId) => {
    const url = "https://api.notion.com/v1/blocks/" + pageId + "/children";
    const options = {
        method: "get",
        headers: NOTION_HEADERS,
    };
    const res = UrlFetchApp.fetch(url, options);
    const resJson = JSON.parse(res.getContentText());
    return resJson.results;
};
const updateNotionPage = (notionDatabaseItemId, properties) => {
    const url = "https://api.notion.com/v1/pages/" + notionDatabaseItemId;
    const options = {
        method: "patch",
        headers: NOTION_HEADERS,
        payload: JSON.stringify(properties),
    };
    const res = UrlFetchApp.fetch(url, options);
};
const removeNotionCheck = (notionDatabaseItemId) => {
    const properties = {
        "properties": { "Instagramに投稿予定": { checkbox: false } },
    };
    updateNotionPage(notionDatabaseItemId, properties);
};
const dateJp = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
};
const createInstagramCaption = (notionData) => {
    const notionProperties = notionData.properties;
    const pageData = retrieveNotionPage(notionData.id);
    const spotNames = notionProperties.観光スポット.title[0].text.content.split("・");
    const spotHashTag = spotNames.map((name) => "#" + name).join(" ");
    const visitedDate = new Date(notionProperties.訪問日.date.start);
    const visitedDateJp = dateJp(visitedDate);
    const contentText = pageData
        .map((data) => {
        const richText = data.paragraph.rich_text[0];
        if (richText) {
            return richText.plain_text;
        }
        else {
            return "";
        }
    })
        .join("\n\n");
    const caption = `\n観光スポット：${spotHashTag}\n訪問日：${visitedDateJp}\n\n${contentText}`.replace(/\n\n\n+/, "\n\n");
    return caption;
};
const updateInstagram = (notionData) => { };
const postInstagram = (notionData) => {
    const notionProperties = notionData.properties;
    const imageUrls = notionProperties.写真.files.map((value) => value.file.url);
    const isCarousel = imageUrls.length >= 2;
    // 各写真のIDを発行
    const instagramItemIds = imageUrls.map((url, index) => {
        const isVideo = notionProperties.写真.files[index].name.slice(-3) === "mp4";
        const headers = {
            is_carousel_item: (isCarousel).toString(),
            access_token: INSTAGRAM_TOKEN,
        };
        // カルーセルじゃなかったら本文を追加
        if (!isCarousel) {
            headers.caption = createInstagramCaption(notionData);
        }
        // 動画か画像かで場合分け
        if (isVideo) {
            headers.media_type = "VIDEO";
            headers.video_url = url;
        }
        else {
            headers.image_url = url;
        }
        const options = {
            method: "post",
            payload: headers,
        };
        const res = UrlFetchApp.fetch(INSTAGRAM_MEDIA_URL, options);
        const resJson = JSON.parse(res.getContentText());
        if (isVideo) {
            sleep(90 * 1000);
        }
        return resJson.id;
    });
    // 写真が1枚か複数枚かで場合分け
    let instagramPostId = "";
    if (isCarousel) {
        // 各IDを1つのカルーセルにまとめる
        const secondHeaders = {
            media_type: "CAROUSEL",
            access_token: INSTAGRAM_TOKEN,
            caption: createInstagramCaption(notionData),
            children: instagramItemIds.join(","),
        };
        const secondOptions = {
            method: "post",
            payload: secondHeaders,
        };
        const secondRes = UrlFetchApp.fetch(INSTAGRAM_MEDIA_URL, secondOptions);
        const secondResJson = JSON.parse(secondRes.getContentText());
        const carouselId = secondResJson.id;
        // 投稿する
        const thirdHeaders = {
            creation_id: carouselId,
            access_token: INSTAGRAM_TOKEN,
        };
        const thirdOptions = {
            method: "post",
            payload: thirdHeaders,
        };
        const thirdRes = UrlFetchApp.fetch(INSTAGRAM_MEDIA_PUBLISH_URL, thirdOptions);
        const thirdResJson = JSON.parse(thirdRes.getContentText());
        instagramPostId = thirdResJson.id;
    }
    else {
        // 投稿する
        const secondHeaders = {
            access_token: INSTAGRAM_TOKEN,
            caption: createInstagramCaption(notionData),
            creation_id: instagramItemIds[0],
        };
        const secondOptions = {
            method: "post",
            payload: secondHeaders,
        };
        const secondRes = UrlFetchApp.fetch(INSTAGRAM_MEDIA_PUBLISH_URL, secondOptions);
        const secondResJson = JSON.parse(secondRes.getContentText());
        instagramPostId = secondResJson.id;
    }
    const props = {
        "properties": {
            Instagramの投稿ID: { rich_text: [{ text: { content: instagramPostId } }] },
        },
    };
    updateNotionPage(notionData.id, props);
};
const syncInstagram = () => {
    const notionDatas = queryCheckedNotionData();
    notionDatas.forEach((notionData) => {
        // 投稿が存在するかどうかで場合分け
        if (notionData.properties.Instagramの投稿ID.rich_text[0]) {
            // updateInstagram(notionData);
        }
        else {
            postInstagram(notionData);
        }
        removeNotionCheck(notionData.id);
    });
};
const test = () => {
    const notionDatas = queryCheckedNotionData();
    const notionData = notionDatas[0];
    const pageId = notionData.id;
    const pageData = retrieveNotionPage(pageId);
    // createInstagramCaption(notionData);
};

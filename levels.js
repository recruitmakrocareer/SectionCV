// Photorealistic scenes. Region centers and sizes use image percentages.
// The shared original stays visible outside these five soft edit masks.
((root) => {
  const levels = [
    {
      "id": "produce",
      "title": "โซนผักและผลไม้",
      "shortTitle": "ผักและผลไม้",
      "original": "assets/produce-original.webp",
      "edited": "assets/produce-edited.webp",
      "width": 1536,
      "height": 1024,
      "differences": [
        {
          "id": "produce-banana",
          "label": "รอยสุกบนเปลือกกล้วย",
          "x": 12.598,
          "y": 13.135,
          "width": 9.961,
          "height": 19.16,
          "targetSize": 7.5
        },
        {
          "id": "produce-cabbage",
          "label": "กะหล่ำปลีเปลี่ยนสี",
          "x": 39.941,
          "y": 20.703,
          "width": 15.586,
          "height": 16.171,
          "targetSize": 11
        },
        {
          "id": "produce-pepper",
          "label": "พริกหวานเปลี่ยนสี",
          "x": 57.096,
          "y": 38.086,
          "width": 7.735,
          "height": 10.899,
          "targetSize": 6.5
        },
        {
          "id": "produce-tomato",
          "label": "มะเขือเทศเปลี่ยนสี",
          "x": 24.023,
          "y": 70.361,
          "width": 8.906,
          "height": 13.183,
          "targetSize": 7.5
        },
        {
          "id": "produce-citrus",
          "label": "ส้มเปลี่ยนเป็นสีเขียว",
          "x": 69.596,
          "y": 77.393,
          "width": 10.546,
          "height": 15.293,
          "targetSize": 8.5
        }
      ]
    },
    {
      "id": "bakery",
      "title": "มุมเบเกอรี่อบสด",
      "shortTitle": "เบเกอรี่",
      "original": "assets/bakery-original.webp",
      "edited": "assets/bakery-edited.webp",
      "width": 1536,
      "height": 1024,
      "differences": [
        {
          "id": "bakery-score",
          "x": 30.404,
          "y": 20.898,
          "width": 11.25,
          "height": 15.82,
          "label": "รอยบากบนขนมปัง",
          "targetSize": 9.25
        },
        {
          "id": "bakery-sesame",
          "x": 89.583,
          "y": 24.951,
          "width": 12.89,
          "height": 13.183,
          "label": "งาบนขนมปังก้อน",
          "targetSize": 9.36
        },
        {
          "id": "bakery-chocolate",
          "x": 12.5,
          "y": 54.98,
          "width": 7.031,
          "height": 13.009,
          "label": "ปลายครัวซองต์เคลือบช็อกโกแลต",
          "targetSize": 6.7
        },
        {
          "id": "bakery-muffin",
          "x": 64.844,
          "y": 51.855,
          "width": 10.546,
          "height": 11.954,
          "label": "หน้ามัฟฟินเปลี่ยนสี",
          "targetSize": 7.93
        },
        {
          "id": "bakery-sugar",
          "x": 28.223,
          "y": 72.461,
          "width": 9.3,
          "height": 12,
          "label": "น้ำตาลบนขนมปังเกลียวหายไป",
          "targetSize": 9.42
        }
      ]
    },
    {
      "id": "pantry",
      "title": "ชั้นเครื่องปรุงและของแห้ง",
      "shortTitle": "เครื่องปรุง",
      "original": "assets/pantry-original.webp",
      "edited": "assets/pantry-edited.webp",
      "width": 1536,
      "height": 1024,
      "differences": [
        {
          "id": "grocery-label",
          "x": 11.198,
          "y": 24.756,
          "width": 8.906,
          "height": 16.699,
          "label": "ฉลากขวดซอสเปลี่ยนสี",
          "targetSize": 8.55
        },
        {
          "id": "grocery-cap",
          "x": 48.828,
          "y": 9.326,
          "width": 5.391,
          "height": 6.152,
          "label": "ฝาขวดน้ำมันเปลี่ยนสี",
          "targetSize": 6
        },
        {
          "id": "grocery-tin",
          "x": 93.685,
          "y": 51.123,
          "width": 7.501,
          "height": 15.293,
          "label": "กระป๋องเปลี่ยนสี",
          "targetSize": 7.59
        },
        {
          "id": "grocery-olives",
          "x": 43.717,
          "y": 56.543,
          "width": 9.257,
          "height": 21.445,
          "label": "กระเทียมเปลี่ยนเป็นมะกอก",
          "targetSize": 10.22
        },
        {
          "id": "grocery-lid",
          "x": 12.63,
          "y": 77.686,
          "width": 10.312,
          "height": 5.098,
          "label": "ฝาโหลเครื่องปรุงเปลี่ยนสี",
          "targetSize": 6.51
        }
      ]
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = levels;
  else root.MAKRO_LEVELS = levels;
})(typeof window !== 'undefined' ? window : this);

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useTheme } from "@mui/material/styles";
import {
  Button,
  TextField,
  Grid,
  Container,
  Box,
  FormControl,
  OutlinedInput,
  InputLabel,
  Select,
  Checkbox,
  Badge,
  CssBaseline,
  Snackbar,
  Alert,
  MenuItem,
  Chip,
  FormHelperText,
  Typography,
  Modal,
  IconButton,
  InputAdornment,
  CircularProgress,
  RadioGroup, FormControlLabel, Radio
} from "@mui/material";
import ButtonGroup from "@mui/material/ButtonGroup";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useDropzone } from 'react-dropzone';
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import { green } from "@mui/material/colors";
import SendIcon from "@mui/icons-material/Send";
import CameraIcon from "@mui/icons-material/Camera";
import LoopIcon from "@mui/icons-material/Loop";
import { Html5QrcodeScanner } from "html5-qrcode";
import CloseIcon from "@mui/icons-material/Close";
import { Swiper, SwiperSlide } from "swiper/react";
import CheckIcon from "@mui/icons-material/Check";
import "swiper/swiper-bundle.css";
import SwiperCore from "swiper/core";
import { Pagination, Navigation } from "swiper/modules";
import RecipientAutocomplete from "./RecipientAutocomplete";
import BtnGroupLocation from "./btngroupLocation";
import CollectionsIcon from '@mui/icons-material/Collections';

// Регистрация модулей
SwiperCore.use([Pagination, Navigation]);

const theme = createTheme({
  palette: {
    primary: {
      main: '#171c8f',
    },
  },
  components: {
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: 'rgba(23, 28, 143, 0.5)', // Цвет по умолчанию с прозрачностью
            },
            '&:hover fieldset': {
              borderColor: '#171c8f', // Цвет при наведении
            },
            '&.Mui-focused fieldset': {
              borderColor: '#171c8f', // Цвет при фокусе
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& fieldset': {
            borderColor: 'rgba(23, 28, 143, 0.5)', // Цвет по умолчанию с прозрачностью
          },
          '&:hover fieldset': {
            borderColor: '#171c8f', // Цвет при наведении
          },
          '&.Mui-focused fieldset': {
            borderColor: '#171c8f', // Цвет при фокусе
          },
        },
      },
    },
  },
});

const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: 48 * 4.5 + 8,
      width: 250,
    },
  },
};

const App = () => {
  const theme = useTheme();
  const [eoNumber, setEoNumber] = useState("");
  const [transportation, setTransportation] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  // const [photos, setPhotos] = useState([]);
  const [problems, setProblems] = useState([]);
  const [choices, setChoices] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [videoSource, setVideoSource] = useState("environment");
  const [scannerOpen, setScannerOpen] = useState(false); // Управление состоянием отображения сканера
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [location, setLocation] = useState("");
  const [isEOMissing, setIsEOMissing] = useState(false);
  const [cameraPhotos, setCameraPhotos] = useState([]);
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [isTransportationRequired, setIsTransportationRequired] = useState(false);
  const [scannerTransportationOpen, setScannerTransportationOpen] = useState(false); // Состояние для сканера
  const scannerTransportationRef = useRef(null); // Ссылка на экземпляр сканера
  const qrReaderRef = useRef(null); // Ссылка на элемент с ID qr-reader
  const [selectedRadioValue, setSelectedRadioValue] = useState("");

  const handleRadioChange = (e) => {
    setSelectedRadioValue(e.target.value);
  };


  // Обработчик успешного сканирования
  const handleScanSuccess = (decodedText) => {
    console.log("QR код успешно отсканирован:", decodedText);
    setTransportation(decodedText); // Устанавливаем отсканированный текст в поле "Транспортировка"
    stopScannerTransportation(); // Закрываем сканер после успешного сканирования
  };

  // Функция для старта сканера
  const startScannerTransportation = () => {
    // Убедимся, что сканер не инициализирован повторно
    if (scannerTransportationRef.current) {
      console.log("Сканер уже инициализирован.");
      return;
    }

    if (qrReaderRef.current) {
      // Создаем сканер только если он еще не был создан
      console.log("Создаем новый экземпляр сканера...");
      const html5QrCodeScanner = new Html5QrcodeScanner(
        "qr-reader", // Указываем id элемента для сканера
        { fps: 30, qrbox: 250 }, // Уменьшаем размер окна для сканирования
        false
      );
      scannerTransportationRef.current = html5QrCodeScanner; // Сохраняем экземпляр сканера
      html5QrCodeScanner.render(handleScanSuccess); // Инициализируем сканер
    }
  };

  // Функция для остановки сканера
  const stopScannerTransportation = () => {
    if (scannerTransportationRef.current) {
      scannerTransportationRef.current.clear(); // Очищаем сканер
      scannerTransportationRef.current = null;
      setScannerTransportationOpen(false); // Закрываем UI для сканера
    }
  };

  // Функция для переключения состояния сканера
  const toggleScannerTransportation = () => {
    if (scannerTransportationOpen) {
      stopScannerTransportation(); // Если сканер уже открыт, закрываем его
    } else {
      setScannerTransportationOpen(true); // Открываем сканер
    }
  };

  // Запуск сканера только после рендеринга компонента
  useEffect(() => {
    if (scannerTransportationOpen) {
      startScannerTransportation(); // Инициализируем новый экземпляр сканера
    } else {
      stopScannerTransportation(); // Останавливаем сканер, если он закрыт
    }

    // Очищаем сканер, если компонент размонтирован
    return () => {
      stopScannerTransportation(); // Очистка на случай размонтирования компонента
    };
  }, [scannerTransportationOpen]);


  const [key, setKey] = useState(0);
  const [userProfile, setUserProfile] = React.useState({
    userDepartment: "",
    userOffice: "",
    userDisplayName: "",
    userTitle: "",
  });

  const [errors, setErrors] = useState({
    eoNumber: "",
    selectedRecipient: "",
    location: "",
    problems: "",
    transportation: "",
    selectedRadioValue: "",
  });



  const handleFocus = (field) => {
    setErrors((prevErrors) => ({
      ...prevErrors,
      [field]: "", // Сбрасываем ошибку для указанного поля
    }));
  };

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scannerRef = useRef(null);
  const timer = useRef();


  // Настройка Dropzone
  const { getRootProps, getInputProps } = useDropzone({
    accept: 'image/*',
    multiple: true,
    onDrop: (acceptedFiles) => {
      const newPhotos = acceptedFiles.map((file) => URL.createObjectURL(file));
      setGalleryPhotos((prevPhotos) => [...newPhotos, ...prevPhotos]);
    },
  });
  // Проверяем наличие фото в стейтах
  const hasPhotos = cameraPhotos.length > 0 || galleryPhotos.length > 0;
  const buttonColor = hasPhotos ? '#171c8f' : 'error.main'; // Цвет кнопок

  const buttonSx = {
    width: '50%',
    bgcolor: success ? green[500] : "#171c8f", // Цвет кнопки по умолчанию или зеленый при успехе

    color: "white", // Белый цвет текста
    "&:focus": {
      bgcolor: success ? green[700] : "", // Цвет при наведении
    },
  };

  useEffect(() => {
    fetchUserProfile();
    fetchChoices();
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
    };
  }, []);

  // Обработка изменения выбора
  const handleChange = (event) => {
    const {
      target: { value },
    } = event;
    const selectedProblems = typeof value === "string" ? value.split(",") : value;

    // new
    // Проверяем, выбрана ли проблема "Не найдена"
    if (selectedProblems.includes("Не найдена")) {
      setLocation("Не найдена в зоне отгрузки"); // Автоматически заполняем поле
    }
    // new

    setProblems(selectedProblems); // Обновляем состояние проблем
  };

  const resetButtonState = () => {
    timer.current = setTimeout(() => {
      setSuccess(false); // Возврат кнопки к исходному состоянию через 2 секунды
    }, 3000);
  };

  const checkEoNumberInRecentRecords = async (eoNumber) => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const officeParts = userProfile.userOffice.split("-");
    const officeSuffix =
      officeParts.length > 1 ? officeParts[1].trim() : userProfile.userOffice;

    try {
      const response = await axios.get(
        `https://portal.lenta.com/sites/obrazceo/_api/web/lists/getbytitle('ProblemsPallet')/items?$filter=(THU eq '${eoNumber}' and DC_THU eq '${officeSuffix}' and Created ge datetime'${twentyFourHoursAgo}')`,
        {
          headers: { Accept: "application/json;odata=verbose" },
        }
      );
      if (response.data.d.results.length > 0) {
        setSnackbarOpen(true);
        setEoNumber(""); // Сбросить поле Номер ЕО
      }
    } catch (error) {
      console.error("Ошибка при проверке Номер ЕО:", error);
    }
  };

  const handleBlurEoNumber = () => {
    const validPattern = /^(ЕО отсутствует|\d{17}|\d{18})$/;

    if (!validPattern.test(eoNumber)) {
      setErrors({ ...errors, eoNumber: "Введите 17 или 18 цифр или 'ЕО отсутствует'" });
    } else {
      setErrors({ ...errors, eoNumber: "" }); // Очистка ошибки

      // Дополнительная проверка, если значение не "ЕО отсутствует"
      if (eoNumber && eoNumber !== "ЕО отсутствует") {
        checkEoNumberInRecentRecords(eoNumber);
      }
    }
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === "clickaway") {
      return; // игнорируем случайное закрытие при потере фокуса
    }
    setSnackbarOpen(false); // закрытие только при нажатии на крестик
  };


  // Получение вариантов для выбора из SharePoint
  const fetchChoices = async () => {
    try {
      const response = await fetch(
        `https://portal.lenta.com/sites/obrazceo/_api/web/lists/getbytitle('ProblemsPallet')/fields?$filter=InternalName eq 'Problems'`,
        {
          method: "GET",
          headers: {
            Accept: "application/json;odata=verbose",
          },
        }
      );
      const data = await response.json();
      const field = data.d.results[0];
      if (field && field.Choices) {
        setChoices(field.Choices.results);
      } else {
        console.error("Поле выбора не найдено или не содержит значений");
      }
    } catch (error) {
      console.error("Ошибка при получении вариантов выбора для поля:", error);
    }
  };

  // Функция для получения профиля текущего пользователя
  const fetchUserProfile = async () => {
    try {
      // Запрос для получения данных профиля текущего пользователя
      const response = await axios.get(
        "https://portal.lenta.com/sites/obrazceo/_api/SP.UserProfiles.PeopleManager/GetMyProperties",
        {
          headers: {
            Accept: "application/json;odata=verbose",
          },
        }
      );

      // Извлечение необходимых данных пользователя
      const userProperties = response.data.d.UserProfileProperties.results;

      const userDepartment =
        findUserProfileProperty(userProperties, "Department")?.Value ||
        "Не указано";
      const userOffice =
        findUserProfileProperty(userProperties, "Office")?.Value || "Не указано";
      const userDisplayName =
        findUserProfileProperty(userProperties, "PreferredName")?.Value ||
        "Не указано";
      const userTitle = response.data.d.Title;

      // Логика для изменения userOffice
      let updatedUserOffice = userOffice;

      // Добавление условия для изменения userOffice, если userOffice = "РЦ-8117" и userDepartment = "Группа отгрузки РЦ"
      if (userOffice === "РЦ-8117" && userDepartment === "Группа отгрузки РЦ") {
        updatedUserOffice = "РЦ-8114";
      }

      // Обновление профиля пользователя
      const updatedProfile = {
        userDepartment,
        userOffice: updatedUserOffice,
        userDisplayName,
        userTitle,
      };

      setUserProfile(updatedProfile);

      // Выводим обновленный объект в консоль
      console.log("Обновленный профиль пользователя:", updatedProfile);
    } catch (error) {
      console.error("Ошибка при получении профиля пользователя:", error);
    }
  };


  // Открытие модального окна для камеры
  const openCameraModal = () => {
    setCameraOpen(true);
    startCamera();
  };

  // Закрытие модального окна камеры
  const closeCameraModal = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const startCamera = () => {
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: videoSource,
        },
        audio: false,
      })
      .then((stream) => {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      })
      .catch((err) => {
        console.error("Ошибка доступа к камере:", err);
      });
  };

  const stopCamera = () => {
    let stream = videoRef.current.srcObject;
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
    }
  };

  const capturePhoto = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const imageDataUrl = canvas.toDataURL("image/png");
    setCameraPhotos((prevCameraPhotos) => [imageDataUrl, ...prevCameraPhotos]);
  };

  const handleCameraSwitch = () => {
    setVideoSource(videoSource === "environment" ? "user" : "environment");
    stopCamera();
    startCamera();
  };

  const handleCheckboxChange = () => {
    if (isEOMissing) {
      // Сброс состояния
      setIsEOMissing(false);
      setEoNumber(""); // Сброс значения
      setSelectedRadioValue(""); // Сбрасываем выбранное значение радиокнопок
    } else {
      // Установка состояния, когда "ЕО отсутствует"
      setIsEOMissing(true);
      setEoNumber("ЕО отсутствует"); // Установка значения
    }
  };

  const handleApplyPhotos = () => {
    closeCameraModal();
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    // Сбрасываем ошибки
    setErrors({
      eoNumber: "",
      selectedRecipient: "",
      location: "",
      problems: "",
      transportation: "",
      selectedRadioValue: "",

    });

    // Проверка обязательных полей
    let formIsValid = true;
    const newErrors = {};

    const validEoNumberPattern = /^(ЕО отсутствует|\d{17}|\d{18})$/;
    if (!eoNumber) {
      newErrors.eoNumber = "Поле Номер ЕО обязательно для заполнения";
      formIsValid = false;
    } else if (!validEoNumberPattern.test(eoNumber)) {
      newErrors.eoNumber = "Введите 17 или 18 цифр или 'ЕО отсутствует'";
      formIsValid = false;
    }
    if (isEOMissing && !selectedRadioValue) { // Валидация для радиокнопок, если "ЕО отсутствует"
      newErrors.selectedWarehouse = "Пожалуйста, выберите склад";
      formIsValid = false;
    }
    if (!selectedRecipient) {
      newErrors.selectedRecipient = "Пожалуйста, выберите получателя";
      formIsValid = false;
    }
    if (!location) {
      newErrors.location = "Поле Местоположение обязательно для заполнения";
      formIsValid = false;
    }
    if (isTransportationRequired && !transportation) {
      newErrors.transportation = "Поле Транспортировка обязательно для заполнения";
      formIsValid = false;
    }
    if (problems.length === 0) {
      newErrors.problems = "Пожалуйста, выберите хотя бы одну проблему";
      formIsValid = false;
    }

    if (!formIsValid) {
      setErrors(newErrors);
      return; // Прекращаем выполнение, если поля не заполнены
    }

    // new
    // Проверка на наличие фотографий, если проблема не "Не найдена"
    if (!problems.includes("Не найдена")) {
      if (cameraPhotos.length === 0 && galleryPhotos.length === 0) {
        alert("Добавьте фото!");
        return;
      }
    }
    // new

    if (!loading) {
      setSuccess(false);
      setLoading(true);

      const officeParts = userProfile.userOffice.split("-");
      const officeSuffix =
        officeParts.length > 1 ? officeParts[1].trim() : userProfile.userOffice;

      try {
        const digest = await getRequestDigest();

        // Создаем новый элемент
        const createItemResponse = await axios.post(
          `https://portal.lenta.com/sites/obrazceo/_api/web/lists/getbytitle('ProblemsPallet')/items`,
          {
            __metadata: { type: "SP.Data.ProblemsPalletListItem" },
            THU: eoNumber,
            DC_THU: officeSuffix,
            RecipientId: selectedRecipient,
            Location1: location,
            Shipment: transportation,
            WhNotEO: selectedRadioValue,
            Problems: {
              __metadata: { type: "Collection(Edm.String)" },
              results: problems,
            },
          },
          {
            headers: {
              Accept: "application/json;odata=verbose",
              "Content-Type": "application/json;odata=verbose",
              "X-RequestDigest": digest,
            },
          }
        );

        const itemId = createItemResponse.data.d.Id;

        // Собираем все фото
        const allPhotos = [...cameraPhotos, ...galleryPhotos];

        // Отправка фотографий в SharePoint
        for (let i = 0; i < allPhotos.length; i++) {
          const photo = allPhotos[i];
          const blob = await fetch(photo).then((res) => res.blob());
          const fileName = `photo_${i + 1}.png`;

          await axios.post(
            `https://portal.lenta.com/sites/obrazceo/_api/web/lists/getbytitle('ProblemsPallet')/items(${itemId})/AttachmentFiles/add(FileName='${fileName}')`,
            blob,
            {
              headers: {
                Accept: "application/json;odata=verbose",
                "X-RequestDigest": digest,
                "Content-Type": "application/octet-stream",
              },
            }
          );
        }

        // Обновление статуса элемента
        await axios.post(
          `https://portal.lenta.com/sites/obrazceo/_api/web/lists/getbytitle('ProblemsPallet')/items(${itemId})`,
          {
            __metadata: { type: "SP.Data.ProblemsPalletListItem" },
            Status: "Выполнено",
          },
          {
            headers: {
              Accept: "application/json;odata=verbose",
              "Content-Type": "application/json;odata=verbose",
              "X-RequestDigest": digest,
              "IF-MATCH": "*",
              "X-HTTP-Method": "MERGE",
            },
          }
        );

        // Успешное завершение
        setSuccess(true);
        setLoading(false);
        resetButtonState(); // Возврат кнопки к обычному состоянию

        // Сброс всех полей
        setEoNumber("");
        setIsEOMissing(false);
        setCameraPhotos([]);
        setGalleryPhotos([]);
        setProblems([]);
        setSelectedRecipient(null);
        setLocation("");
        setTransportation("");
        setKey((prevKey) => prevKey + 1); // Сброс Autocomplete
        setSelectedRadioValue("");

      } catch (error) {
        console.error("Ошибка отправки данных:", error);
        setSuccess(false);
        setLoading(false);
      }
    }
  };

  const getRequestDigest = async () => {
    const response = await axios.post(
      "https://portal.lenta.com/sites/obrazceo/_api/contextinfo",
      {},
      {
        headers: {
          Accept: "application/json;odata=verbose",
        },
      }
    );
    return response.data.d.GetContextWebInformation.FormDigestValue;
  };

  // Функция поиска свойства профиля пользователя
  const findUserProfileProperty = (properties, propertyName) => {
    return properties.find((prop) => prop.Key === propertyName);
  };

  const handleBarcodeScanSuccess = (decodedText) => {
    console.log("Штрихкод успешно отсканирован:", decodedText);
    setEoNumber(decodedText); // Устанавливаем отсканированный текст в поле "Номер ЕО"
    // Выполняем валидацию после установки значения
    const validPattern = /^(ЕО отсутствует|\d{17}|\d{18})$/;
    if (!validPattern.test(decodedText)) {
      setErrors((prevErrors) => ({
        ...prevErrors,
        eoNumber: "Введите 17 или 18 цифр или 'ЕО отсутствует'",
      }));
    } else {
      setErrors((prevErrors) => ({
        ...prevErrors,
        eoNumber: "",
      }));

      // Проверяем наличие ЕО в недавних записях
      checkEoNumberInRecentRecords(decodedText);
    }
    setScannerOpen(false); // Закрываем сканер после успешного сканирования

    if (scannerRef.current) {
      console.log("Очищаем сканер после успешного сканирования.");
      scannerRef.current.clear(); // Очищаем сканер
      scannerRef.current = null; // Сбрасываем ссылку на сканер
    }
  };

  const startScanner = () => {
    const html5QrCodeScanner = new Html5QrcodeScanner(
      "reader", // ID элемента для отображения сканера
      { fps: 30, qrbox: 250 }, // Параметры сканера
      false
    );
    scannerRef.current = html5QrCodeScanner; // Сохраняем экземпляр сканера
    html5QrCodeScanner.render(handleBarcodeScanSuccess); // Инициализируем сканер
  };
  const stopScanner = () => {
    console.log("Останавливаем и очищаем сканер...");
    if (scannerRef.current) {
      scannerRef.current.clear(); // Очищаем сканер
      scannerRef.current = null; // Сбрасываем ссылку на сканер
      setScannerOpen(false); // Закрываем UI для сканера
    }
  };

  const toggleScanner = () => {
    console.log("Нажата кнопка сканирования. Сброс поля Номер ЕО.");
    setEoNumber(""); // Сброс значения поля "Номер ЕО"

    if (scannerOpen) {
      // Если сканер открыт, скрываем его
      console.log("Сканер открыт, скрываем сканер.");
      stopScanner();
    } else {
      // Если сканер закрыт, открываем его
      console.log("Сканер закрыт, открываем сканер.");
      setScannerOpen(true); // Открываем UI для сканера
      startScanner(); // Инициализируем новый экземпляр сканера
    }
  };


  const handleInputChange = (event) => {
    if (!isEOMissing) {
      const value = event.target.value;

      // Разрешить ввод цифр или оставить поле пустым
      if (/^\d*$/.test(value) || value === "") {
        setEoNumber(value);
        setErrors({ ...errors, eoNumber: "" }); // Очистка ошибки
      } else {
        setErrors({ ...errors, eoNumber: "Введите 17 или 18 цифр или 'ЕО отсутствует'" });
      }
    }
  };

  const handleLocationChange = (value) => {
    setLocation(value); // Обновляем состояние location
    if (/отгружен/i.test(value)) {
      setIsTransportationRequired(true); // Активируем поле "Транспортировка"
    } else {
      setIsTransportationRequired(false); // Скрываем поле "Транспортировка"
    }
  };





  return (
    <ThemeProvider theme={theme}>
      <Container component="primary" maxWidth="sm" sx={{ p: 0 }}>
        <Typography
          variant="h5"
          gutterBottom
          sx={{
            textAlign: "center", // Центрирование заголовка
            my: 2,
          }}
        >
          Проблемные ЕО
        </Typography>
        <form onSubmit={handleFormSubmit}>
          <Grid
            container
            direction="column"
            alignItems="normal"
            sx={{
              p: 2,
              maxWidth: "100%", // Ограничиваем максимальную ширину контейнера
              overflowX: "hidden", // Отключаем горизонтальную прокрутку
            }}
          >
            {/* Поле Номер ЕО */}
            <Grid item xs={12} sx={{ mt: 1 }}>
              <TextField
                type="text"
                label="Номер ЕО"
                fullWidth
                disabled={loading}
                required
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: 'rgba(23, 28, 143, 0.5)', // Цвет по умолчанию
                    },
                    '&:hover fieldset': {
                      borderColor: '#171c8f', // Цвет при наведении
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#171c8f', // Цвет при фокусе
                    },
                  },
                }}
                error={!!errors.eoNumber}
                helperText={errors.eoNumber}
                value={eoNumber}
                onChange={handleInputChange}
                onBlur={handleBlurEoNumber}
                inputProps={{
                  inputMode: "numeric", // Указание на цифровую клавиатуру
                  //pattern: "\\d*|ЕО отсутствует", // Указание на цифры
                }}
                InputProps={{
                  startAdornment: isEOMissing ? (
                    <InputAdornment position="start" sx={{ marginLeft: "8px" }}
                      title="Нет ЕО"
                      placeholder="Нет ЕО">
                      {/* Кнопка с чекбоксом */}
                      <Button
                        variant="outlined"
                        onClick={handleCheckboxChange}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          padding: "2px 2px", // Уменьшили внутренние отступы
                          backgroundColor: isEOMissing ? "green" : "white",
                          borderColor: "gray",
                          color: isEOMissing ? "white" : "black",
                          transition: "background-color 0.3s ease",
                          "&:hover": {
                            backgroundColor: isEOMissing
                              ? "darkgreen"
                              : "lightgray",
                          },
                          minWidth: "fit-content", // Минимальная ширина
                          borderRadius: "15px", // Овальная форма, еще меньше
                        }}
                      >
                        <Checkbox
                          checked={isEOMissing}
                          title="Нет ЕО"
                          placeholder="Нет ЕО чек"
                          onChange={handleCheckboxChange}
                          sx={{
                            padding: "2px 2px",
                            color: isEOMissing ? "white" : "gray",
                            "&.Mui-checked": {
                              color: "white", // Цвет галочки при активном состоянии
                            },
                          }}
                        />
                        Нет ЕО
                      </Button>
                    </InputAdornment>
                  ) : null,
                  endAdornment: !isEOMissing ? (
                    <InputAdornment position="end" sx={{ marginRight: "8px" }}
                      title="Нет ЕО"
                      placeholder="Нет ЕО">

                      {/* Кнопка с чекбоксом до нажатия */}
                      <Button
                        variant="outlined"
                        onClick={handleCheckboxChange}
                        placeholder="Нет ЕО"
                        title="Нет ЕО"
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          padding: "2px 2px", // Уменьшили внутренние отступы
                          backgroundColor: isEOMissing ? "green" : "white",
                          borderColor: "gray",
                          color: isEOMissing ? "white" : "black",
                          transition: "background-color 0.3s ease",
                          "&:hover": {
                            backgroundColor: isEOMissing
                              ? "darkgreen"
                              : "lightgray",
                          },
                          minWidth: "fit-content", // Минимальная ширина
                          borderRadius: "15px", // Овальная форма, еще меньше
                        }}
                      >
                        <Checkbox
                          checked={isEOMissing}
                          placeholder="Нет ЕО"
                          title="Нет ЕО"
                          onChange={handleCheckboxChange}
                          sx={{
                            padding: "2px 2px",
                            color: isEOMissing ? "white" : "gray",
                            "&.Mui-checked": {
                              color: "white", // Цвет галочки при активном состоянии
                            },
                          }}
                        />
                        Нет ЕО
                      </Button>
                      {/* Иконка сканера */}
                      <IconButton onClick={toggleScanner}
                        title="ScannerEO">
                        <QrCodeScannerRoundedIcon

                          sx={{
                            color: "#171c8f",
                            width: "4vh",
                            height: "4vh",
                          }}
                        />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}

              />
            </Grid>
            {/* Радиокнопки отображаются только если isEOMissing === true */}
            {isEOMissing && (
              <Grid item xs={12} sx={{ mt: 2 }}>
                <FormControl
                  component="fieldset"
                  error={!!errors.selectedWarehouse}
                  sx={{
                    border: `0.5px solid ${!!errors.selectedWarehouse ? 'red' : '#171c8f'}`, // Граница поля по умолчанию
                    borderRadius: '4px', // Радиус границы
                    padding: '10px', // Отступы внутри границы
                    '&:focus-within': { // Псевдокласс для фокуса внутри fieldset
                      border: `2px solid ${!!errors.selectedWarehouse ? 'red' : '#171c8f'}`, // Утолщение бордера при фокусе
                    },
                  }}
                >
                  <legend>Выберите склад:</legend>
                  <RadioGroup
                    value={selectedRadioValue}
                    onChange={handleRadioChange}
                    name="eo-selection"
                    sx={{ display: "flex", flexDirection: "row", justifyContent: "space-evenly" }}
                  >
                    <FormControlLabel value="A" control={<Radio />} label="A" />
                    <FormControlLabel value="B" control={<Radio />} label="B" />
                    <FormControlLabel value="C" control={<Radio />} label="C" />
                    <FormControlLabel value="D" control={<Radio />} label="D" />
                    <FormControlLabel value="E" control={<Radio />} label="E" />
                    <FormControlLabel value="Транзит" control={<Radio />} label="Транзит" />
                  </RadioGroup>
                  <FormHelperText>{errors.selectedWarehouse}</FormHelperText>
                </FormControl>
              </Grid>
            )}
            {/* Сканнер QR-кода */}
            <Grid item xs={12}>
              <Box
                id="reader"
                sx={{
                  pt: 0,
                  display: scannerOpen ? "block" : "none",
                  maxWidth: "100%",
                  overflowX: "hidden",
                }}
              />
            </Grid>

            <Grid item xs={12} sx={{ mt: 1 }}>
              <RecipientAutocomplete
                value={selectedRecipient}
                disabled={loading}
                isEOMissing={isEOMissing}
                key={key} // Передаем динамический ключ для рендеринга
                onSelect={(value) => {
                  console.log("Recipient selected:", value);
                  setSelectedRecipient(value);
                }}
                error={!!errors.selectedRecipient} // Проверяем наличие ошибки
                helperText={errors.selectedRecipient}
                onFocus={() => handleFocus("selectedRecipient")} // Сообщение об ошибке
              />
            </Grid>

            {/* Селект с множественным выбором */}
            <Grid item xs={12} sx={{ mt: 1 }}>
              <FormControl fullWidth error={!!errors.problems}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: 'rgba(23, 28, 143, 0.5)', // Цвет по умолчанию
                    },
                    '&:hover fieldset': {
                      borderColor: '#171c8f', // Цвет при наведении
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#171c8f', // Цвет при фокусе
                    },
                  },
                }}>
                <InputLabel required id="multiple-chip-label">
                  Выберите проблемы
                </InputLabel>
                <Select
                  labelId="multiple-chip-label"
                  id="select-multiple-chip"
                  multiple
                  required
                  disabled={loading}
                  value={problems}
                  onChange={handleChange}
                  onFocus={() => handleFocus("problems")}
                  input={<OutlinedInput label="Выберите проблемы" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip key={value} label={value} />
                      ))}
                    </Box>
                  )}
                  MenuProps={MenuProps}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: '#171c8f', // Начальный цвет границы
                      },
                      '&:hover fieldset': {
                        borderColor: '#171c8f', // Цвет границы при наведении
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#171c8f', // Цвет границы при фокусе
                      },
                    },
                  }}
                >
                  {choices.map((choice) => (
                    <MenuItem key={choice} value={choice}>
                      {choice}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>{errors.problems}</FormHelperText>
              </FormControl>
            </Grid>
            <Grid item xs={12} sx={{ mt: 1 }}>
              <FormControl fullWidth error={!!errors.location}>
                <BtnGroupLocation
                  isEOMissing={isEOMissing}
                  disabled={loading}
                  errors={errors.location}
                  location={location}
                  setLocation={(value) => {
                    handleLocationChange(value);
                  }}
                  handleFocus={handleFocus}
                />
              </FormControl>
            </Grid>
            {/* Поле Транспортировка */}
            {isTransportationRequired && (
              <Grid item xs={12} sx={{ mt: 1 }}>
                <TextField
                  error={!!errors?.transportation}
                  helperText={errors?.transportation || ""}
                  type="number"
                  label="Транспортировка"
                  fullWidth
                  disabled={loading}
                  inputProps={{
                    inputMode: "numeric", // Указание на цифровую клавиатуру
                    pattern: "\\d*", // Указание на цифры
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: 'rgba(23, 28, 143, 0.5)', // Цвет по умолчанию
                      },
                      '&:hover fieldset': {
                        borderColor: '#171c8f', // Цвет при наведении
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#171c8f', // Цвет при фокусе
                      },
                    },
                  }}
                  required
                  value={transportation}
                  onChange={(e) => setTransportation(e.target.value)}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={toggleScannerTransportation}>
                          <QrCodeScannerRoundedIcon
                            sx={{
                              color: "#171c8f",
                              width: "4vh",
                              height: "4vh",
                            }} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
            )}

            {/* Контейнер для сканера QR-кода */}
            <Grid item xs={12}>
              <Box
                id="qr-reader"
                ref={qrReaderRef} // Ссылка на div
                sx={{
                  pt: 0,
                  display: scannerTransportationOpen ? "block" : "none", // Контролируем видимость
                  maxWidth: "100%",
                  overflowX: "hidden",
                }}
              />
            </Grid>

            <Grid item xs={12} sx={{ mt: 1 }}>
              <TextField
                error={!!errors.location}
                helperText={errors.location}
                type="text"
                label="Другое местоположение"
                fullWidth
                disabled={loading}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: 'rgba(23, 28, 143, 0.5)', // Цвет по умолчанию
                    },
                    '&:hover fieldset': {
                      borderColor: '#171c8f', // Цвет при наведении
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#171c8f', // Цвет при фокусе
                    },
                  },
                }}
                required
                value={location}
                onChange={(e) => handleLocationChange(e.target.value)}
                onFocus={() => handleFocus("location")}
              />
            </Grid>


            <Box
              sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                width: '100%',
              }}
            >
              <ButtonGroup
                variant="contained"
                fullWidth
                sx={{
                  "& .MuiButtonBase-root": {
                    fontSize: "1.2rem",
                    padding: "12px 24px",
                    height: "56px",
                  },
                  margin: 0,
                }}
              >
                {/* Кнопка для камеры */}
                <Button
                  variant="contained"
                  onClick={openCameraModal}
                  disabled={loading}
                  sx={{
                    bgcolor: hasPhotos ? buttonColor : 'error.main',
                    color: 'white',
                    flex: 1,
                    width: '25%', // 25% ширины
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Badge
                    badgeContent={cameraPhotos.length}
                    color="secondary"
                    overlap="circular"
                  >
                    <CameraIcon sx={{ fontSize: '3rem' }} />
                  </Badge>
                </Button>

                {/* Кнопка для галереи */}
                <Box {...getRootProps()} sx={{ flex: 1, width: '25%' }}>
                  <input
                    {...getInputProps()}
                    id="file-upload"
                    style={{ display: 'none' }}
                    aria-label="Загрузить фото"
                    accept=".jpg,.png,.jpeg"
                    type="file"
                    title="Нажмите для загрузки фото"
                    placeholder="Выберите фото для загрузки"
                  />
                  <label htmlFor="file-upload" style={{ cursor: 'pointer' }}>


                    <Button
                      variant="contained"
                      disabled={loading}
                      aria-label="Загрузить фото"
                      sx={{
                        bgcolor: hasPhotos ? buttonColor : 'error.main',
                        color: 'white',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%', // 25% ширины
                      }}
                    >
                      <Badge
                        badgeContent={galleryPhotos.length}
                        color="secondary"
                        overlap="circular"
                      >
                        <CollectionsIcon sx={{ fontSize: '3rem' }} />
                      </Badge>
                    </Button>
                  </label>
                </Box>

                {/* Кнопка отправки */}
                <Button
                  fullWidth
                  variant="contained"
                  sx={buttonSx}
                  disabled={loading}
                  type="submit"
                  onClick={(e) => {

                    // new
                    // Проверка на наличие фотографий, если проблема не "Не найдена"
                    if (!problems.includes("Не найдена")) {
                      if (cameraPhotos.length === 0 && galleryPhotos.length === 0) {
                        e.preventDefault();
                        alert("Добавьте фото!");
                        return;
                      }
                    }
                    // new
                    handleFormSubmit(e);
                  }}
                  endIcon={loading ? "" : <SendIcon />}
                >
                  {loading ? (
                    <CircularProgress size={24} sx={{ color: "white" }} />
                  ) : success ? (
                    <>
                      <CheckIcon sx={{ marginRight: 1 }} />
                      Данные отправлены
                    </>
                  ) : (
                    "Отправить"
                  )}
                </Button>
              </ButtonGroup>
            </Box>
          </Grid>
        </form>
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert onClose={handleSnackbarClose} severity="error" variant="filled">
            Такая ЕО уже отправлялась в течение последних 24 часов.
          </Alert>
        </Snackbar>
        <Modal open={cameraOpen} onClose={closeCameraModal}>
          <Box
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
              bgcolor: "rgba(0, 0, 0, 0.7)", // затемнение фона
              zIndex: 1300,
            }}
          >
            {/*Блок видео на все окно*/}
            <video
              ref={videoRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                zIndex: -1, // видео находится на заднем фоне
              }}
              playsInline
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            <Box
              sx={{
                position: "fixed", // Прикрепляем к нижней части экрана
                bottom: 0, // Располагаем у нижней границы
                left: 0,
                right: 0,
                width: "100%", // Ширина на весь экран
                display: "flex",
                flexDirection: "column", // Элементы идут в колонку
                justifyContent: "flex-end",
                alignItems: "center",
                zIndex: 2,
                bgcolor: "rgba(0, 0, 0, 0.7)", // Полупрозрачный фон
              }}
            >
              {/*Блок слайдера с фотографиями, скрывается если нет фото*/}
              {cameraPhotos.length > 0 && (
                <Box
                  sx={{
                    width: "100%",
                    height: "20vh", // 25% от высоты окна
                    bgcolor: "rgba(0, 0, 0, 0.5)", // полупрозрачный фон
                    marginBottom: "1vh", // расстояние до нижней границы
                  }}
                >
                  <Swiper
                    spaceBetween={10}
                    slidesPerView={3}
                    navigation
                    pagination={{
                      clickable: true,
                      el: ".swiper-pagination", // селектор для пагинации
                    }}
                    style={{ height: "100%" }}
                  >
                    {cameraPhotos.map((cameraPhoto, index) => (
                      <SwiperSlide key={index}>
                        <Box
                          sx={{
                            position: "relative",
                            width: "100%",
                            height: "100%",
                          }}
                        >
                          <img
                            src={cameraPhoto}
                            alt={`Фото ${index + 1}`}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{
                              position: "absolute",
                              top: 4,
                              left: 4,
                              color: "white",
                              bgcolor: "rgba(0, 0, 0, 0.6)",
                              padding: "2px 4px",
                            }}
                          >
                            Фото {index + 1}
                          </Typography>
                          <IconButton
                            onClick={() =>
                              setCameraPhotos(cameraPhotos.filter((_, i) => i !== index))
                            }
                            sx={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              bgcolor: "red",
                              color: "white",
                            }}
                          >
                            <CloseIcon />
                          </IconButton>
                        </Box>
                      </SwiperSlide>
                    ))}
                    // Пагинация
                    <div className="swiper-pagination" />
                  </Swiper>
                </Box>
              )}

              {/*Блок с кнопками*/}
              <Box
                sx={{
                  width: "100%",
                  height: "5vh",
                  display: "flex",
                  justifyContent: "space-around",
                  alignItems: "center",
                  bgcolor: "rgba(0, 0, 0, 0.5)", // полупрозрачный фон
                  padding: "2vh 0",
                }}
              >
                <ButtonGroup
                  variant="text"
                  aria-label="button group"
                  sx={{
                    width: "100%",
                    justifyContent: "space-between",
                    "& .MuiButtonBase-root": {
                      border: "none", // убираем границу
                      outline: "none", // убираем фокус
                      "&:focus": {
                        outline: "none",
                        border: "none",
                      },
                    },
                  }}
                >
                  <Button sx={{ flex: 1 }} onClick={handleCameraSwitch}>
                    <IconButton
                      sx={{
                        height: "48px",
                        width: "48px",
                        color: "white",
                        bgcolor: "#171c8f",
                        "&:hover": { bgcolor: "#0f154d" },
                        "&:focus": { outline: "none" }, // убираем бордер при клике
                      }}
                    >
                      <LoopIcon />
                    </IconButton>
                  </Button>
                  <Button sx={{ flex: 1 }} onClick={capturePhoto}>
                    <IconButton
                      sx={{
                        height: "48px",
                        width: "48px",
                        color: "white",
                        bgcolor: "#171c8f",
                        "&:hover": { bgcolor: "#0f154d" },
                        "&:focus": { outline: "none" }, // убираем бордер при клике
                      }}
                    >
                      <CameraIcon />
                    </IconButton>
                  </Button>
                  <Button sx={{ flex: 1 }} onClick={handleApplyPhotos}>
                    <Box sx={{ "&:hover": { bgcolor: "#0f154d" } }}>
                      <IconButton
                        sx={{
                          bgcolor: "#171c8f",
                          color: "white",
                          height: "48px",
                          width: "48px",
                          "&:focus": { outline: "none" }, // убираем бордер при клике
                        }}
                      >
                        <SendIcon
                          sx={{
                            height: "40px",
                            width: "40px",
                          }}
                        />
                        {cameraPhotos.length > 0 && (
                          <Box
                            sx={{
                              position: "absolute",
                              top: "-0.02rem",
                              right: "-0.02rem",
                              bgcolor: "#595de3",
                              borderRadius: "50%",
                              height: "20px",
                              width: "20px",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ color: "white", fontSize: "12px" }}
                            >
                              {cameraPhotos.length}
                            </Typography>
                          </Box>
                        )}
                      </IconButton>
                    </Box>
                  </Button>
                </ButtonGroup>
              </Box>
            </Box>
          </Box>
        </Modal>
      </Container>
    </ThemeProvider >
  );
};

export default App;
